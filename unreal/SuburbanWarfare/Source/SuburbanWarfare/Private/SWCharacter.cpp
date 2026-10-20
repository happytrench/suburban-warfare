#include "SWCharacter.h"
#include "SWWeapons.h"
#include "SWGameMode.h"
#include "SWPlayerState.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InputComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Net/UnrealNetwork.h"
#include "DrawDebugHelpers.h"
#include "TimerManager.h"
#include "UObject/ConstructorHelpers.h"

static constexpr float WalkSpeed = 620.f;    // 6.2 m/s, same as the browser game
static constexpr float SprintSpeed = 940.f;  // 9.4 m/s
static constexpr float SpawnProtectSec = 1.5f;

ASWCharacter::ASWCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;

	GetCapsuleComponent()->InitCapsuleSize(40.f, 90.f);

	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->MaxWalkSpeed = WalkSpeed;
	Move->JumpZVelocity = 760.f;
	Move->GravityScale = 2.25f;          // 22 m/s^2 like the browser game: snappy jumps
	Move->AirControl = 0.35f;
	Move->BrakingDecelerationWalking = 3200.f;
	Move->GroundFriction = 10.f;
	Move->MaxAcceleration = 5200.f;
	Move->MaxStepHeight = 45.f;
	bUseControllerRotationYaw = true;
	Move->bOrientRotationToMovement = false;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0.f, 0.f, 70.f));   // eyes 1.6 m above the feet
	Camera->bUsePawnControlRotation = true;
	Camera->SetFieldOfView(90.f);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));

	ViewGun = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("ViewGun"));
	ViewGun->SetupAttachment(Camera);
	ViewGun->SetRelativeLocation(ViewGunBase);
	ViewGun->SetRelativeScale3D(FVector(0.5f, 0.06f, 0.1f));
	ViewGun->SetOnlyOwnerSee(true);
	ViewGun->SetCastShadow(false);
	ViewGun->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (CubeMesh.Succeeded()) ViewGun->SetStaticMesh(CubeMesh.Object);

	BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BodyMesh"));
	BodyMesh->SetupAttachment(GetCapsuleComponent());
	BodyMesh->SetRelativeLocation(FVector(0.f, 0.f, -15.f));
	BodyMesh->SetRelativeScale3D(FVector(0.7f, 0.7f, 1.5f));
	BodyMesh->SetOwnerNoSee(true);
	BodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (CylMesh.Succeeded()) BodyMesh->SetStaticMesh(CylMesh.Object);

	HeadMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("HeadMesh"));
	HeadMesh->SetupAttachment(GetCapsuleComponent());
	HeadMesh->SetRelativeLocation(FVector(0.f, 0.f, 72.f));
	HeadMesh->SetRelativeScale3D(FVector(0.3f));
	HeadMesh->SetOwnerNoSee(true);
	HeadMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (SphereMesh.Succeeded()) HeadMesh->SetStaticMesh(SphereMesh.Object);

	WorldGun = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("WorldGun"));
	WorldGun->SetupAttachment(GetCapsuleComponent());
	WorldGun->SetRelativeLocation(FVector(45.f, 20.f, 30.f));
	WorldGun->SetRelativeScale3D(FVector(0.6f, 0.06f, 0.1f));
	WorldGun->SetOwnerNoSee(true);
	WorldGun->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (CubeMesh.Succeeded()) WorldGun->SetStaticMesh(CubeMesh.Object);

	Ammo.SetNum(SWWeapons::Num);
	for (int32 i = 0; i < SWWeapons::Num; ++i) Ammo[i] = SWWeapons::Get(i).Mag;
}

void ASWCharacter::BeginPlay()
{
	Super::BeginPlay();
	if (HasAuthority())
	{
		SpawnProtectUntil = GetWorld()->GetTimeSeconds() + SpawnProtectSec;
	}
	// team colour on the placeholder body
	if (const ASWPlayerState* PS = GetPlayerState<ASWPlayerState>())
	{
		const FLinearColor C = PS->Team == 2 ? FLinearColor(0.76f, 0.25f, 0.05f) : PS->Team == 1 ? FLinearColor(0.23f, 0.51f, 0.96f) : FLinearColor(0.8f, 0.8f, 0.75f);
		if (UMaterialInstanceDynamic* M = BodyMesh->CreateAndSetMaterialInstanceDynamic(0)) M->SetVectorParameterValue(TEXT("Color"), C);
	}
	ApplyWeaponVisual();
}

void ASWCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(ASWCharacter, Health);
	DOREPLIFETIME(ASWCharacter, WeaponIndex);
	DOREPLIFETIME_CONDITION(ASWCharacter, Ammo, COND_OwnerOnly);
	DOREPLIFETIME(ASWCharacter, bReloading);
	DOREPLIFETIME_CONDITION(ASWCharacter, bSprinting, COND_SkipOwner);
	DOREPLIFETIME_CONDITION(ASWCharacter, bAiming, COND_SkipOwner);
	DOREPLIFETIME(ASWCharacter, bDead);
	DOREPLIFETIME(ASWCharacter, SpawnProtectUntil);
}

void ASWCharacter::SetupPlayerInputComponent(UInputComponent* In)
{
	Super::SetupPlayerInputComponent(In);
	In->BindAxis(TEXT("MoveForward"), this, &ASWCharacter::MoveForward);
	In->BindAxis(TEXT("MoveRight"), this, &ASWCharacter::MoveRight);
	In->BindAxis(TEXT("Turn"), this, &ASWCharacter::Turn);
	In->BindAxis(TEXT("LookUp"), this, &ASWCharacter::LookUp);
	In->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
	In->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
	In->BindAction(TEXT("Fire"), IE_Pressed, this, &ASWCharacter::FirePressed);
	In->BindAction(TEXT("Fire"), IE_Released, this, &ASWCharacter::FireReleased);
	In->BindAction(TEXT("Aim"), IE_Pressed, this, &ASWCharacter::AimPressed);
	In->BindAction(TEXT("Aim"), IE_Released, this, &ASWCharacter::AimReleased);
	In->BindAction(TEXT("Sprint"), IE_Pressed, this, &ASWCharacter::SprintPressed);
	In->BindAction(TEXT("Sprint"), IE_Released, this, &ASWCharacter::SprintReleased);
	In->BindAction(TEXT("Reload"), IE_Pressed, this, &ASWCharacter::ReloadPressed);
	In->BindAction(TEXT("NextWeapon"), IE_Pressed, this, &ASWCharacter::NextWeapon);
	In->BindAction(TEXT("PrevWeapon"), IE_Pressed, this, &ASWCharacter::PrevWeapon);
	In->BindAction(TEXT("Weapon1"), IE_Pressed, this, &ASWCharacter::SelectN<0>);
	In->BindAction(TEXT("Weapon2"), IE_Pressed, this, &ASWCharacter::SelectN<1>);
	In->BindAction(TEXT("Weapon3"), IE_Pressed, this, &ASWCharacter::SelectN<2>);
	In->BindAction(TEXT("Weapon4"), IE_Pressed, this, &ASWCharacter::SelectN<3>);
	In->BindAction(TEXT("Weapon5"), IE_Pressed, this, &ASWCharacter::SelectN<4>);
	In->BindAction(TEXT("Weapon6"), IE_Pressed, this, &ASWCharacter::SelectN<5>);
}

// ------------------------------------------------------------------ movement / look
void ASWCharacter::MoveForward(float V)
{
	if (V != 0.f && !bDead) AddMovementInput(GetActorForwardVector(), V);
}
void ASWCharacter::MoveRight(float V)
{
	if (V != 0.f && !bDead) AddMovementInput(GetActorRightVector(), V);
}
void ASWCharacter::Turn(float V) { AddControllerYawInput(V); }
void ASWCharacter::LookUp(float V) { AddControllerPitchInput(V); }

void ASWCharacter::SprintPressed() { bSprinting = true; ServerSetMoveFlags(bSprinting, bAiming); }
void ASWCharacter::SprintReleased() { bSprinting = false; ServerSetMoveFlags(bSprinting, bAiming); }
void ASWCharacter::AimPressed() { bAiming = true; ServerSetMoveFlags(bSprinting, bAiming); }
void ASWCharacter::AimReleased() { bAiming = false; ServerSetMoveFlags(bSprinting, bAiming); }

void ASWCharacter::ServerSetMoveFlags_Implementation(bool bInSprint, bool bInAim)
{
	bSprinting = bInSprint;
	bAiming = bInAim;
}

// ------------------------------------------------------------------ weapons
void ASWCharacter::SelectWeapon(int32 Index)
{
	if (bDead || Index < 0 || Index >= SWWeapons::Num || Index == WeaponIndex) return;
	WeaponIndex = (uint8)Index;
	bReloading = false;
	GetWorldTimerManager().ClearTimer(ReloadTimer);
	LocalNextFire = GetWorld()->GetTimeSeconds() + 0.25f;
	ApplyWeaponVisual();
	ServerSetWeapon((uint8)Index);
}
void ASWCharacter::NextWeapon() { SelectWeapon((WeaponIndex + 1) % SWWeapons::Num); }
void ASWCharacter::PrevWeapon() { SelectWeapon((WeaponIndex + SWWeapons::Num - 1) % SWWeapons::Num); }

void ASWCharacter::ServerSetWeapon_Implementation(uint8 Index)
{
	if (Index >= SWWeapons::Num) return;
	WeaponIndex = Index;
	bReloading = false;
	GetWorldTimerManager().ClearTimer(ReloadTimer);
	ServerNextFire = FMath::Max(ServerNextFire, GetWorld()->GetTimeSeconds() + 0.2f);
	ApplyWeaponVisual();
}

void ASWCharacter::OnRep_Weapon() { ApplyWeaponVisual(); }

void ASWCharacter::ApplyWeaponVisual()
{
	if (WeaponMeshes.IsValidIndex(WeaponIndex) && WeaponMeshes[WeaponIndex])
	{
		const FTransform T = WeaponMeshOffsets.IsValidIndex(WeaponIndex) ? WeaponMeshOffsets[WeaponIndex] : FTransform::Identity;
		ViewGun->SetStaticMesh(WeaponMeshes[WeaponIndex]);
		ViewGun->SetRelativeScale3D(T.GetScale3D());
		ViewGunBase = FVector(35.f, 14.f, -18.f) + T.GetLocation();
		WorldGun->SetStaticMesh(WeaponMeshes[WeaponIndex]);
		WorldGun->SetRelativeScale3D(T.GetScale3D());
	}
	else
	{
		// placeholder lengths roughly matching each gun
		static const float Len[SWWeapons::Num] = { 0.55f, 0.6f, 0.4f, 0.65f, 0.75f, 0.2f };
		ViewGun->SetRelativeScale3D(FVector(Len[FMath::Clamp<int32>(WeaponIndex, 0, SWWeapons::Num - 1)], 0.06f, 0.1f));
	}
}

void ASWCharacter::FirePressed() { bFireHeld = true; bFiredThisPress = false; TryFire(); }
void ASWCharacter::FireReleased() { bFireHeld = false; }

float ASWCharacter::CurrentSpread() const
{
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);
	const bool bAimed = AimAlpha > 0.7f && !bSprinting;
	float S = W.bScoped ? (bAimed ? W.Spread : W.HipSpread) : W.Spread * (bAimed ? SWWeapons::AdsSpreadMult : 1.f);
	if (bSprinting) S *= 1.6f;
	if (GetCharacterMovement()->IsFalling()) S *= 1.4f;
	return S;
}

bool ASWCharacter::IsSpawnProtected() const
{
	return GetWorld() && GetWorld()->GetTimeSeconds() < SpawnProtectUntil;
}

void ASWCharacter::TryFire()
{
	if (bDead || bReloading || !IsLocallyControlled()) return;
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);
	if (!W.bAuto && bFiredThisPress) return;
	const float Now = GetWorld()->GetTimeSeconds();
	if (Now < LocalNextFire) return;
	if (!Ammo.IsValidIndex(WeaponIndex) || Ammo[WeaponIndex] <= 0) { bFiredThisPress = true; ReloadPressed(); return; }
	bFiredThisPress = true;
	LocalNextFire = Now + W.CooldownSec;

	FVector Origin; FRotator ViewRot;
	GetActorEyesViewPoint(Origin, ViewRot);
	Origin = Camera->GetComponentLocation();
	const bool bAimed = AimAlpha > 0.7f && !bSprinting;
	ServerFire(Origin, ViewRot.Vector(), FMath::Rand(), bAimed);

	// learnable recoil: climbs straight up for a few rounds, then drifts; most of it stays
	Burst = (Now - LastShotTime < 0.26f) ? Burst + 1 : 0;
	LastShotTime = Now;
	if (AController* C = GetController())
	{
		const float M = bAimed ? 0.62f : 1.f;
		const float Up = (W.RecoilUp + FMath::Min(Burst, 12) * W.RecoilClimb) * M * FMath::FRandRange(0.9f, 1.1f);
		const float Side = (FMath::Sin(Burst * 0.85f + 1.3f) * (Burst > 3 ? 1.f : 0.25f) + FMath::FRandRange(-0.25f, 0.25f)) * W.RecoilSide * M;
		FRotator R = C->GetControlRotation();
		R.Pitch = FMath::ClampAngle(R.Pitch + Up, -89.f, 89.f);
		R.Yaw -= Side;
		C->SetControlRotation(R);
	}
	// view-gun kick spring
	const float KickScale = W.bAuto ? 1.f : 3.f;
	KickZV += 90.f * KickScale * (bAimed ? 0.5f : 1.f);
	KickPV += 140.f * KickScale * (bAimed ? 0.5f : 1.f);
	Bloom = FMath::Min(1.f, Bloom + (W.bAuto ? 0.18f : 0.6f));
}

void ASWCharacter::ServerFire_Implementation(FVector_NetQuantize Origin, FVector_NetQuantizeNormal Dir, int32 Seed, bool bAimed)
{
	if (bDead || bReloading) return;
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);
	UWorld* World = GetWorld();
	const float Now = World->GetTimeSeconds();
	if (Now < ServerNextFire - 0.03f) return;                       // fire-rate cap (small jitter allowance)
	if (!Ammo.IsValidIndex(WeaponIndex) || Ammo[WeaponIndex] <= 0) return;
	// the shot must come from roughly where we are (no shooting from across the map)
	const FVector Eye = GetActorLocation() + FVector(0.f, 0.f, 70.f);
	if (FVector::DistSquared(Eye, Origin) > FMath::Square(150.f)) Origin = Eye;
	ServerNextFire = FMath::Max(ServerNextFire, Now) + W.CooldownSec;
	Ammo[WeaponIndex]--;

	const bool bSrvAimed = bAimed && !bSprinting;
	float Spread = W.bScoped ? (bSrvAimed ? W.Spread : W.HipSpread) : W.Spread * (bSrvAimed ? SWWeapons::AdsSpreadMult : 1.f);
	if (bSprinting) Spread *= 1.6f;
	if (GetCharacterMovement()->IsFalling()) Spread *= 1.4f;

	FRandomStream Rng(Seed);
	FCollisionObjectQueryParams Obj;
	Obj.AddObjectTypesToQuery(ECC_WorldStatic);
	Obj.AddObjectTypesToQuery(ECC_WorldDynamic);
	Obj.AddObjectTypesToQuery(ECC_Pawn);
	FCollisionQueryParams Params(SCENE_QUERY_STAT(SWShot), true, this);

	TMap<ASWCharacter*, float> DamageBy;  // pellets sum per victim
	TMap<ASWCharacter*, bool> HeadBy;
	for (int32 i = 0; i < W.Pellets; ++i)
	{
		const FVector D = Rng.VRandCone(FVector(Dir), Spread);
		const FVector End = Origin + D * W.RangeM * 100.f;
		FHitResult Hit;
		const bool bHit = World->LineTraceSingleByObjectType(Hit, Origin, End, Obj, Params);
		MulticastShotFX(Origin, bHit ? Hit.ImpactPoint : End, WeaponIndex);
		if (!bHit) continue;
		ASWCharacter* Victim = Cast<ASWCharacter>(Hit.GetActor());
		if (!Victim || Victim->bDead) continue;
		const bool bHead = Hit.ImpactPoint.Z > Victim->GetActorLocation().Z + 55.f;
		float Dmg = W.Damage * (bHead ? W.HeadMult : 1.f);
		const float DistM = Hit.Distance / 100.f;
		if (DistM > W.FalloffStartM)
		{
			const float K = FMath::Clamp((DistM - W.FalloffStartM) / FMath::Max(1.f, W.RangeM - W.FalloffStartM), 0.f, 1.f);
			Dmg *= 1.f - K * (1.f - W.FalloffMin);
		}
		DamageBy.FindOrAdd(Victim) += Dmg;
		HeadBy.FindOrAdd(Victim) |= bHead;
	}
	for (const TPair<ASWCharacter*, float>& P : DamageBy)
	{
		P.Key->ReceiveHit(P.Value, this, WeaponIndex, HeadBy.FindRef(P.Key));
	}
}

void ASWCharacter::ReceiveHit(float Damage, ASWCharacter* Shooter, uint8 Weapon, bool bHead)
{
	if (!HasAuthority() || bDead || IsSpawnProtected() || Damage <= 0.f) return;
	if (Shooter && Shooter != this)
	{
		const ASWPlayerState* A = GetPlayerState<ASWPlayerState>();
		const ASWPlayerState* B = Shooter->GetPlayerState<ASWPlayerState>();
		const ASWGameMode* GM = GetWorld()->GetAuthGameMode<ASWGameMode>();
		if (GM && GM->bTeamMode && A && B && A->Team == B->Team) return;   // no friendly fire
	}
	Health = FMath::Max(0.f, Health - Damage);
	OnRep_Health();
	ClientTookDamage();
	const bool bKill = Health <= 0.f;
	if (Shooter) Shooter->ClientHitConfirm(bHead, bKill);
	if (bKill) Die(Shooter, Weapon, bHead);
}

void ASWCharacter::ClientHitConfirm_Implementation(bool bHead, bool bKill)
{
	HitMarkerTime = GetWorld()->GetTimeSeconds();
	bLastHitHead = bHead;
	bLastHitKill = bKill;
}

void ASWCharacter::ClientTookDamage_Implementation()
{
	DamageFlashTime = GetWorld()->GetTimeSeconds();
}

void ASWCharacter::OnRep_Health() {}

void ASWCharacter::Die(ASWCharacter* Killer, uint8 Weapon, bool bHead)
{
	bDead = true;
	OnRep_Dead();
	if (ASWGameMode* GM = GetWorld()->GetAuthGameMode<ASWGameMode>())
	{
		GM->OnPlayerKilled(GetController(), Killer ? Killer->GetController() : nullptr, Weapon, bHead);
	}
	DetachFromControllerPendingDestroy();
	SetLifeSpan(4.f);
}

void ASWCharacter::OnRep_Dead()
{
	if (!bDead) return;
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GetCharacterMovement()->DisableMovement();
	// topple the placeholder body
	BodyMesh->SetRelativeRotation(FRotator(0.f, 0.f, 80.f));
	BodyMesh->SetRelativeLocation(FVector(0.f, 0.f, -70.f));
	HeadMesh->SetRelativeLocation(FVector(0.f, 80.f, -75.f));
	ViewGun->SetVisibility(false);
	WorldGun->SetVisibility(false);
}

void ASWCharacter::ReloadPressed()
{
	if (bDead || bReloading) return;
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);
	if (!Ammo.IsValidIndex(WeaponIndex) || Ammo[WeaponIndex] >= W.Mag) return;
	if (IsLocallyControlled() && !HasAuthority()) bReloading = true;   // predict for the HUD
	ServerReload();
}

void ASWCharacter::ServerReload_Implementation()
{
	if (bDead || bReloading) return;
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);
	if (!Ammo.IsValidIndex(WeaponIndex) || Ammo[WeaponIndex] >= W.Mag) return;
	bReloading = true;
	GetWorldTimerManager().SetTimer(ReloadTimer, this, &ASWCharacter::FinishReload, W.ReloadSec, false);
}

void ASWCharacter::FinishReload()
{
	if (!bReloading || bDead) return;
	Ammo[WeaponIndex] = SWWeapons::Get(WeaponIndex).Mag;
	bReloading = false;
}

void ASWCharacter::MulticastShotFX_Implementation(FVector_NetQuantize Start, FVector_NetQuantize End, uint8 Weapon)
{
	// tracer from the visible gun (prototype: debug line; swap for a Niagara tracer later)
	FVector From = Start;
	if (IsLocallyControlled()) From = ViewGun->GetComponentLocation() + Camera->GetForwardVector() * 30.f;
	else From = WorldGun->GetComponentLocation();
#if ENABLE_DRAW_DEBUG
	DrawDebugLine(GetWorld(), From, End, FColor(255, 220, 140), false, 0.05f, 0, 1.2f);
	DrawDebugPoint(GetWorld(), End, 6.f, FColor(255, 240, 200), false, 0.08f);
#endif
}

// ------------------------------------------------------------------ per-frame
void ASWCharacter::Tick(float Dt)
{
	Super::Tick(Dt);
	const bool bLocal = IsLocallyControlled();
	const FSWWeapon& W = SWWeapons::Get(WeaponIndex);

	// sprint / aim affect speed everywhere (server is authoritative, client predicts)
	const bool bCanSprint = bSprinting && !bAiming && GetVelocity().Size2D() > 10.f;
	GetCharacterMovement()->MaxWalkSpeed = bCanSprint ? SprintSpeed : (bAiming ? WalkSpeed * 0.7f : WalkSpeed);

	if (!bLocal) return;
	if (bFireHeld && W.bAuto) TryFire();

	// aim-down-sights zoom
	const bool bWantAim = bAiming && !bSprinting && !bReloading && !bDead;
	AimAlpha = FMath::FInterpConstantTo(AimAlpha, bWantAim ? 1.f : 0.f, Dt, bWantAim ? 7.f : 9.f);
	const float ZoomFov = W.bScoped ? 25.f : 66.f;
	Camera->SetFieldOfView(FMath::Lerp(90.f, ZoomFov, AimAlpha));
	Bloom = FMath::Max(0.f, Bloom - Dt * 3.2f);

	// view-gun springs + walk bob; centred under the eye when aiming
	auto Spring = [Dt](float& X, float& V, float K) { const float C = 2.f * FMath::Sqrt(K) * 0.72f; V += (-K * X - C * V) * Dt; X += V * Dt; };
	Spring(KickZ, KickZV, 260.f);
	Spring(KickP, KickPV, 190.f);
	const float Speed = GetVelocity().Size2D();
	WalkBob += Dt * Speed * 0.018f;
	const float MoveK = GetCharacterMovement()->IsFalling() ? 0.2f : FMath::Min(1.f, Speed / 600.f);
	const float Hip = 1.f - AimAlpha * 0.85f;
	const FVector Bob(0.f, FMath::Sin(WalkBob) * 1.1f * MoveK * Hip, -FMath::Abs(FMath::Cos(WalkBob)) * 0.9f * MoveK * Hip);
	const FVector Aimed(30.f, 0.f, -9.f);
	FVector Loc = FMath::Lerp(ViewGunBase, Aimed, AimAlpha) + Bob - FVector(KickZ, 0.f, 0.f);
	FRotator Rot(KickP, 0.f, 0.f);
	if (bSprinting && !bAiming) { Loc += FVector(-4.f, -4.f, -5.f); Rot += FRotator(-20.f, 30.f, 15.f); }
	if (bReloading) { Loc += FVector(0.f, -3.f, -6.f); Rot += FRotator(12.f, 10.f, 35.f); }
	ViewGun->SetRelativeLocation(Loc);
	ViewGun->SetRelativeRotation(Rot);
}
