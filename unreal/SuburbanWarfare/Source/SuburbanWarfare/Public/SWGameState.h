#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "SWGameState.generated.h"

/** One kill-feed line (kept locally on every client). */
struct FSWFeedLine
{
	FString Killer;
	FString Victim;
	FString Weapon;
	FString Verb;
	bool bHead = false;
	uint8 KillerTeam = 0;
	uint8 VictimTeam = 0;
	double Time = 0.0;
};

UCLASS()
class SUBURBANWARFARE_API ASWGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") bool bTeamMode = false;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") int32 KillLimit = 20;
	/** Server world time when the match ends. */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") float MatchEndTime = 0.f;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") bool bMatchOver = false;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") FString Winner;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") int32 TeamScoreHOA = 0;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") int32 TeamScoreBackroad = 0;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") FString MapName;

	UFUNCTION(NetMulticast, Reliable)
	void MulticastKillFeed(const FString& Killer, const FString& Victim, const FString& Weapon, const FString& Verb, bool bHead, uint8 KillerTeam, uint8 VictimTeam);

	UFUNCTION(NetMulticast, Reliable)
	void MulticastAnnounce(const FString& Message);

	TArray<FSWFeedLine> Feed;
	FString Announcement;
	double AnnouncementTime = -100.0;

	float SecondsLeft() const;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
