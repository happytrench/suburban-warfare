// Player state, game state, game mode and player controller.
#include "SWPlayerState.h"
#include "SWGameState.h"
#include "SWGameMode.h"
#include "SWPlayerController.h"
#include "SWCharacter.h"
#include "SWHUD.h"
#include "SWWeapons.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerStart.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"

// ====================================================================== player state
void ASWPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
	Super::GetLifetimeReplicatedProps(Out);
	DOREPLIFETIME(ASWPlayerState, Team);
	DOREPLIFETIME(ASWPlayerState, Kills);
	DOREPLIFETIME(ASWPlayerState, Deaths);
}

// ====================================================================== game state
void ASWGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
	Super::GetLifetimeReplicatedProps(Out);
	DOREPLIFETIME(ASWGameState, bTeamMode);
	DOREPLIFETIME(ASWGameState, KillLimit);
	DOREPLIFETIME(ASWGameState, MatchEndTime);
	DOREPLIFETIME(ASWGameState, bMatchOver);
	DOREPLIFETIME(ASWGameState, Winner);
	DOREPLIFETIME(ASWGameState, TeamScoreHOA);
	DOREPLIFETIME(ASWGameState, TeamScoreBackroad);
	DOREPLIFETIME(ASWGameState, MapName);
}

float ASWGameState::SecondsLeft() const
{
	return FMath::Max(0.f, MatchEndTime - (float)GetServerWorldTimeSeconds());
}

void ASWGameState::MulticastKillFeed_Implementation(const FString& Killer, const FString& Victim, const FString& Weapon, const FString& Verb, bool bHead, uint8 KillerTeam, uint8 VictimTeam)
{
	FSWFeedLine L;
	L.Killer = Killer; L.Victim = Victim; L.Weapon = Weapon; L.Verb = Verb; L.bHead = bHead;
	L.KillerTeam = KillerTeam; L.VictimTeam = VictimTeam;
	L.Time = GetWorld()->GetTimeSeconds();
	Feed.Add(L);
	if (Feed.Num() > 6) Feed.RemoveAt(0);
}

void ASWGameState::MulticastAnnounce_Implementation(const FString& Message)
{
	Announcement = Message;
	AnnouncementTime = GetWorld()->GetTimeSeconds();
}

// ====================================================================== game mode
static const TCHAR* KillVerbs[][2] = {
	{ TEXT("issued a citation to"), TEXT("issued a citation") }, { TEXT("fined"), TEXT("fined") }, { TEXT("reported"), TEXT("reported") },
	{ TEXT("re-zoned"), TEXT("re-zoned") }, { TEXT("evicted"), TEXT("evicted") }, { TEXT("out-mowed"), TEXT("out-mowed") },
	{ TEXT("filed a complaint on"), TEXT("written up") }, { TEXT("passive-aggressively notified"), TEXT("passive-aggressively notified") },
	{ TEXT("foreclosed on"), TEXT("foreclosed on") }, { TEXT("leaf-blew"), TEXT("leaf-blown") },
};
static const TCHAR* Notices[] = {
	TEXT("HOA NOTICE: A lawn has been measured at 3.2 inches. This is not a drill."),
	TEXT("HOA NOTICE: Unauthorized garden gnome detected. Reproduction is strictly forbidden."),
	TEXT("HOA NOTICE: Trash bins must be out of sight by 6 PM. Combat is permitted until 6:01."),
	TEXT("HOA NOTICE: The ice cream truck is operating without a permit. Tactically."),
	TEXT("HOA NOTICE: Parking an SUV on the street is a Class C violation. Hiding behind one is fine."),
	TEXT("HOA NOTICE: Excessive leaf blowing reported. Fine increased to $500."),
	TEXT("HOA NOTICE: Pink flamingos are limited to two per lawn. Violators will be flamingoed."),
};

ASWGameMode::ASWGameMode()
{
	DefaultPawnClass = ASWCharacter::StaticClass();
	PlayerControllerClass = ASWPlayerController::StaticClass();
	PlayerStateClass = ASWPlayerState::StaticClass();
	GameStateClass = ASWGameState::StaticClass();
	HUDClass = ASWHUD::StaticClass();
	MapRotation = { TEXT("Culdesac"), TEXT("CountryClub"), TEXT("Farmstead"), TEXT("CountyFair"), TEXT("Lake") };
}

void ASWGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	ModeOption = UGameplayStatics::ParseOption(Options, TEXT("mode"));
	if (ModeOption.IsEmpty()) ModeOption = TEXT("ffa");
	bTeamMode = ModeOption.Equals(TEXT("tdm"), ESearchCase::IgnoreCase);
	KillLimit = UGameplayStatics::GetIntOption(Options, TEXT("kills"), 20);
	TimeLimitSec = 60.f * UGameplayStatics::GetIntOption(Options, TEXT("time"), 8);
}

void ASWGameMode::InitGameState()
{
	Super::InitGameState();
	if (ASWGameState* GS = GetGameState<ASWGameState>())
	{
		GS->bTeamMode = bTeamMode;
		GS->KillLimit = KillLimit;
		GS->MatchEndTime = (float)GetWorld()->GetTimeSeconds() + TimeLimitSec;
		GS->MapName = GetWorld()->GetMapName();
	}
	GetWorldTimerManager().SetTimer(TimeCheck, this, &ASWGameMode::CheckTime, 1.f, true);
}

uint8 ASWGameMode::PickTeam() const
{
	if (!bTeamMode) return 0;
	int32 A = 0, B = 0;
	if (const AGameStateBase* GS = GameState)
	{
		for (APlayerState* PS : GS->PlayerArray)
		{
			if (const ASWPlayerState* S = Cast<ASWPlayerState>(PS)) { if (S->Team == 1) ++A; else if (S->Team == 2) ++B; }
		}
	}
	return A <= B ? 1 : 2;
}

void ASWGameMode::PostLogin(APlayerController* NewPlayer)
{
	if (ASWPlayerState* PS = NewPlayer ? NewPlayer->GetPlayerState<ASWPlayerState>() : nullptr) PS->Team = PickTeam();
	Super::PostLogin(NewPlayer);
}

void ASWGameMode::Logout(AController* Exiting)
{
	Super::Logout(Exiting);
}

AActor* ASWGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	// pick the start farthest from the nearest enemy (same rule as the browser server)
	const ASWPlayerState* Me = Player ? Player->GetPlayerState<ASWPlayerState>() : nullptr;
	TArray<FVector> Enemies;
	for (TActorIterator<ASWCharacter> It(GetWorld()); It; ++It)
	{
		if (It->bDead || It->GetController() == Player) continue;
		const ASWPlayerState* Other = It->GetPlayerState<ASWPlayerState>();
		if (bTeamMode && Me && Other && Other->Team == Me->Team) continue;
		Enemies.Add(It->GetActorLocation());
	}
	TArray<APlayerStart*> Starts;
	for (TActorIterator<APlayerStart> It(GetWorld()); It; ++It) Starts.Add(*It);
	if (Starts.Num() == 0) return Super::ChoosePlayerStart_Implementation(Player);
	APlayerStart* Best = nullptr;
	float BestScore = -1.f;
	for (APlayerStart* S : Starts)
	{
		float Nearest = 1e9f;
		for (const FVector& E : Enemies) Nearest = FMath::Min(Nearest, FVector::Dist(E, S->GetActorLocation()));
		const float Score = Nearest + FMath::FRand() * 600.f;   // a little randomness so it isn't predictable
		if (Score > BestScore) { BestScore = Score; Best = S; }
	}
	return Best;
}

void ASWGameMode::OnPlayerKilled(AController* Victim, AController* Killer, uint8 Weapon, bool bHead)
{
	ASWGameState* GS = GetGameState<ASWGameState>();
	if (!GS || GS->bMatchOver) return;
	ASWPlayerState* VS = Victim ? Victim->GetPlayerState<ASWPlayerState>() : nullptr;
	ASWPlayerState* KS = Killer ? Killer->GetPlayerState<ASWPlayerState>() : nullptr;
	if (VS) VS->Deaths++;
	const bool bSuicide = !KS || KS == VS;
	if (!bSuicide)
	{
		KS->Kills++;
		if (bTeamMode) { if (KS->Team == 1) GS->TeamScoreHOA++; else if (KS->Team == 2) GS->TeamScoreBackroad++; }
	}
	const int32 Vi = FMath::RandRange(0, (int32)UE_ARRAY_COUNT(KillVerbs) - 1);
	const FString KillerName = KS ? KS->GetPlayerName() : TEXT("The HOA");
	const FString VictimName = VS ? VS->GetPlayerName() : TEXT("Neighbor");
	GS->MulticastKillFeed(KillerName, VictimName, SWWeapons::Get(Weapon).Short, KillVerbs[Vi][0], bHead, KS ? KS->Team : 0, VS ? VS->Team : 0);
	if (!bFirstBlood && !bSuicide) { bFirstBlood = true; GS->MulticastAnnounce(FString::Printf(TEXT("FIRST BLOOD! %s drew the first citation."), *KillerName)); }

	// death notice + kill cam on the victim's screen
	if (ASWPlayerController* PC = Cast<ASWPlayerController>(Victim))
	{
		PC->ClientOnDeath(KillerName, SWWeapons::Get(Weapon).Name, bHead, (float)GetWorld()->GetTimeSeconds() + 3.f);
		if (Killer && Killer->GetPawn() && !bSuicide) PC->SetViewTargetWithBlend(Killer->GetPawn(), 0.6f, VTBlend_EaseInOut, 2.f);
	}
	if (Victim)
	{
		FTimerHandle H;
		FTimerDelegate D = FTimerDelegate::CreateUObject(this, &ASWGameMode::Respawn, TWeakObjectPtr<AController>(Victim));
		GetWorldTimerManager().SetTimer(H, D, 3.f, false);
	}

	// win check
	if (bTeamMode)
	{
		if (GS->TeamScoreHOA >= KillLimit) EndMatch(TEXT("PRISTINE PINES HOA"));
		else if (GS->TeamScoreBackroad >= KillLimit) EndMatch(TEXT("BACKROAD BOYS"));
	}
	else if (KS && KS->Kills >= KillLimit) EndMatch(KS->GetPlayerName());
}

void ASWGameMode::Respawn(TWeakObjectPtr<AController> Who)
{
	ASWGameState* GS = GetGameState<ASWGameState>();
	if (!Who.IsValid() || (GS && GS->bMatchOver)) return;
	RestartPlayer(Who.Get());
	if (ASWPlayerController* PC = Cast<ASWPlayerController>(Who.Get())) PC->ClientOnRespawn();
}

void ASWGameMode::CheckTime()
{
	ASWGameState* GS = GetGameState<ASWGameState>();
	if (!GS || GS->bMatchOver) return;
	if (FMath::FRand() < 0.03f) GS->MulticastAnnounce(Notices[FMath::RandRange(0, (int32)UE_ARRAY_COUNT(Notices) - 1)]);
	if (GetWorld()->GetTimeSeconds() < GS->MatchEndTime) return;
	// time's up: most kills (or team score) wins
	if (bTeamMode)
	{
		EndMatch(GS->TeamScoreHOA == GS->TeamScoreBackroad ? TEXT("NOBODY (DRAW)") : GS->TeamScoreHOA > GS->TeamScoreBackroad ? TEXT("PRISTINE PINES HOA") : TEXT("BACKROAD BOYS"));
		return;
	}
	const ASWPlayerState* Best = nullptr;
	for (APlayerState* PS : GS->PlayerArray)
	{
		const ASWPlayerState* S = Cast<ASWPlayerState>(PS);
		if (S && (!Best || S->Kills > Best->Kills)) Best = S;
	}
	EndMatch(Best ? Best->GetPlayerName() : TEXT("NOBODY"));
}

void ASWGameMode::EndMatch(const FString& Winner)
{
	ASWGameState* GS = GetGameState<ASWGameState>();
	if (!GS || GS->bMatchOver) return;
	GS->bMatchOver = true;
	GS->Winner = Winner;
	GetWorldTimerManager().SetTimer(NextMapTimer, this, &ASWGameMode::TravelToNextMap, 12.f, false);
}

void ASWGameMode::TravelToNextMap()
{
	const FString Current = GetWorld()->GetMapName();
	int32 Next = 0;
	for (int32 i = 0; i < MapRotation.Num(); ++i) if (Current.EndsWith(MapRotation[i])) Next = (i + 1) % MapRotation.Num();
	if (MapRotation.Num() == 0) return;
	const FString URL = FString::Printf(TEXT("/Game/Maps/%s?listen?mode=%s?kills=%d?time=%d"), *MapRotation[Next], *ModeOption, KillLimit, FMath::RoundToInt(TimeLimitSec / 60.f));
	GetWorld()->ServerTravel(URL);
}

// ====================================================================== player controller
FString ASWPlayerController::MapAsset(const FString& Id)
{
	const FString L = Id.ToLower();
	if (L == TEXT("countryclub")) return TEXT("CountryClub");
	if (L == TEXT("farmstead")) return TEXT("Farmstead");
	if (L == TEXT("countyfair")) return TEXT("CountyFair");
	if (L == TEXT("lake")) return TEXT("Lake");
	return TEXT("Culdesac");
}

void ASWPlayerController::Host(const FString& Map, const FString& Mode)
{
	const FString M = Mode.IsEmpty() ? TEXT("ffa") : Mode.ToLower();
	ConsoleCommand(FString::Printf(TEXT("open /Game/Maps/%s?listen?mode=%s"), *MapAsset(Map), *M), true);
}

void ASWPlayerController::Join(const FString& Address)
{
	if (Address.IsEmpty()) return;
	ClientTravel(Address, TRAVEL_Absolute);
}

void ASWPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	InputComponent->BindAction(TEXT("Scoreboard"), IE_Pressed, this, &ASWPlayerController::ScoresDown);
	InputComponent->BindAction(TEXT("Scoreboard"), IE_Released, this, &ASWPlayerController::ScoresUp);
	InputComponent->BindKey(EKeys::F1, IE_Pressed, this, &ASWPlayerController::HostF1);
	InputComponent->BindKey(EKeys::F2, IE_Pressed, this, &ASWPlayerController::HostF2);
	InputComponent->BindKey(EKeys::F3, IE_Pressed, this, &ASWPlayerController::HostF3);
	InputComponent->BindKey(EKeys::F4, IE_Pressed, this, &ASWPlayerController::HostF4);
	InputComponent->BindKey(EKeys::F5, IE_Pressed, this, &ASWPlayerController::HostF5);
}

void ASWPlayerController::ClientOnDeath_Implementation(const FString& KillerName, const FString& WeaponName, bool bHead, float RespawnAt)
{
	DeathBy = KillerName;
	DeathWeapon = WeaponName;
	bDeathHead = bHead;
	RespawnAtServerTime = RespawnAt;
	bShowDeath = true;
}

void ASWPlayerController::ClientOnRespawn_Implementation()
{
	bShowDeath = false;
}
