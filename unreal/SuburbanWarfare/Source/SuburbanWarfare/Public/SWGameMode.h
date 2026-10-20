// Match rules ported from the browser server (server/game.js): FFA / TDM, kill + time limits,
// 3 s respawn, spawn protection, spawn points away from enemies, map rotation, kill cam.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SWGameMode.generated.h"

UCLASS()
class SUBURBANWARFARE_API ASWGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ASWGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual void InitGameState() override;
	virtual void PostLogin(APlayerController* NewPlayer) override;
	virtual void Logout(AController* Exiting) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual bool ShouldSpawnAtStartSpot(AController* Player) override { return false; }

	void OnPlayerKilled(AController* Victim, AController* Killer, uint8 Weapon, bool bHead);

	bool bTeamMode = false;
	int32 KillLimit = 20;
	float TimeLimitSec = 8.f * 60.f;

	/** Maps in rotation (asset names under /Game/Maps). */
	UPROPERTY(EditDefaultsOnly, Category = "SW") TArray<FString> MapRotation;

protected:
	void CheckTime();
	void EndMatch(const FString& Winner);
	void TravelToNextMap();
	void Respawn(TWeakObjectPtr<AController> Who);
	uint8 PickTeam() const;

	FTimerHandle TimeCheck;
	FTimerHandle NextMapTimer;
	FString ModeOption = TEXT("ffa");
	bool bFirstBlood = false;
};
