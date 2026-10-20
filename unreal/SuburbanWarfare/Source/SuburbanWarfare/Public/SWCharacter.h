// First-person shooter character: movement, six weapons, server-authoritative hitscan, ADS, sprint, recoil.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Engine/NetSerialization.h"
#include "SWCharacter.generated.h"

class UCameraComponent;
class UStaticMeshComponent;
class UStaticMesh;

UCLASS()
class SUBURBANWARFARE_API ASWCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASWCharacter();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void BeginPlay() override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void OnRep_PlayerState() override;
	void ApplyTeamColor();

	// ---- components
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SW") UCameraComponent* Camera;
	/** First-person weapon (only you see it). Replace the mesh per weapon via WeaponMeshes. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SW") UStaticMeshComponent* ViewGun;
	/** Placeholder third-person body (everyone else sees it). Swap for a skeletal character in a Blueprint child. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SW") UStaticMeshComponent* BodyMesh;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SW") UStaticMeshComponent* HeadMesh;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SW") UStaticMeshComponent* WorldGun;

	/** Optional real weapon meshes (rifle, ak, smg, shotgun, deer, pistol). Empty entries keep the placeholder. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "SW") TArray<UStaticMesh*> WeaponMeshes;
	UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "SW") TArray<FTransform> WeaponMeshOffsets;

	// ---- replicated state
	UPROPERTY(ReplicatedUsing = OnRep_Health, BlueprintReadOnly, Category = "SW") float Health = 100.f;
	UPROPERTY(ReplicatedUsing = OnRep_Weapon, BlueprintReadOnly, Category = "SW") uint8 WeaponIndex = 0;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") TArray<int32> Ammo;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") bool bReloading = false;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") bool bSprinting = false;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") bool bAiming = false;
	UPROPERTY(ReplicatedUsing = OnRep_Dead, BlueprintReadOnly, Category = "SW") bool bDead = false;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") float SpawnProtectUntil = 0.f;

	// ---- local-only presentation state (read by the HUD)
	float AimAlpha = 0.f;        // 0 hip .. 1 aimed
	float Bloom = 0.f;           // crosshair spread from firing
	float HitMarkerTime = -10.f;
	bool bLastHitHead = false;
	bool bLastHitKill = false;
	float DamageFlashTime = -10.f;

	/** Server: apply a hit from another player. */
	void ReceiveHit(float Damage, ASWCharacter* Shooter, uint8 Weapon, bool bHead);

	float CurrentSpread() const;
	bool IsSpawnProtected() const;

protected:
	// input
	void MoveForward(float V);
	void MoveRight(float V);
	void Turn(float V);
	void LookUp(float V);
	void FirePressed();
	void FireReleased();
	void AimPressed();
	void AimReleased();
	void SprintPressed();
	void SprintReleased();
	void ReloadPressed();
	void NextWeapon();
	void PrevWeapon();
	void SelectWeapon(int32 Index);
	template <int32 N> void SelectN() { SelectWeapon(N); }

	void TryFire();

	UFUNCTION(Server, Reliable) void ServerFire(FVector_NetQuantize Origin, FVector_NetQuantizeNormal Dir, int32 Seed, bool bAimed);
	UFUNCTION(Server, Reliable) void ServerReload();
	UFUNCTION(Server, Reliable) void ServerSetWeapon(uint8 Index);
	UFUNCTION(Server, Unreliable) void ServerSetMoveFlags(bool bInSprint, bool bInAim);
	UFUNCTION(NetMulticast, Unreliable) void MulticastShotFX(FVector_NetQuantize Start, FVector_NetQuantize End, uint8 Weapon);
	UFUNCTION(Client, Reliable) void ClientHitConfirm(bool bHead, bool bKill);
	UFUNCTION(Client, Reliable) void ClientTookDamage();

	UFUNCTION() void OnRep_Health();
	UFUNCTION() void OnRep_Weapon();
	UFUNCTION() void OnRep_Dead();

	void FinishReload();
	void ApplyWeaponVisual();
	void Die(ASWCharacter* Killer, uint8 Weapon, bool bHead);

private:
	bool bFireHeld = false;
	bool bFiredThisPress = false;
	float LocalNextFire = 0.f;    // client-side pacing (server re-checks)
	float ServerNextFire = 0.f;
	int32 Burst = 0;
	float LastShotTime = -10.f;
	FTimerHandle ReloadTimer;
	// view-gun spring (kick back / rise)
	float KickZ = 0.f, KickZV = 0.f, KickP = 0.f, KickPV = 0.f;
	FVector ViewGunBase = FVector(45.f, 18.f, -22.f);
	float WalkBob = 0.f;
};
