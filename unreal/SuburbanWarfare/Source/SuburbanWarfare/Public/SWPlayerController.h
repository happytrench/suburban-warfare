// Player controller: host / join console commands and quick keys, death info for the HUD.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SWPlayerController.generated.h"

UCLASS()
class SUBURBANWARFARE_API ASWPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	/** Console: host culdesac ffa   (maps: culdesac countryclub farmstead countyfair lake; modes: ffa tdm) */
	UFUNCTION(Exec) void Host(const FString& Map, const FString& Mode);
	/** Console: join 192.168.1.20   (the host's IP address) */
	UFUNCTION(Exec) void Join(const FString& Address);

	UFUNCTION(Client, Reliable) void ClientOnDeath(const FString& KillerName, const FString& WeaponName, bool bHead, float RespawnAt);
	UFUNCTION(Client, Reliable) void ClientOnRespawn();

	FString DeathBy;
	FString DeathWeapon;
	bool bDeathHead = false;
	float RespawnAtServerTime = 0.f;
	bool bShowDeath = false;
	bool bShowScores = false;

	static FString MapAsset(const FString& Id);

protected:
	virtual void SetupInputComponent() override;
	void ScoresDown() { bShowScores = true; }
	void ScoresUp() { bShowScores = false; }
	void HostF1() { Host(TEXT("culdesac"), TEXT("ffa")); }
	void HostF2() { Host(TEXT("countryclub"), TEXT("ffa")); }
	void HostF3() { Host(TEXT("farmstead"), TEXT("ffa")); }
	void HostF4() { Host(TEXT("countyfair"), TEXT("ffa")); }
	void HostF5() { Host(TEXT("lake"), TEXT("ffa")); }
};
