// Canvas HUD (no editor assets needed): crosshair with bloom, hit markers, health, ammo, weapon slots,
// timer and score, kill feed, death notice, scoreboard, scope, match-over banner, host/join help.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SWHUD.generated.h"

UCLASS()
class SUBURBANWARFARE_API ASWHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

protected:
	void DrawCrosshair(class ASWCharacter* Me);
	void DrawBottom(class ASWCharacter* Me);
	void DrawTop(class ASWGameState* GS);
	void DrawFeed(class ASWGameState* GS);
	void DrawScoreboard(class ASWGameState* GS);
	void Panel(float X, float Y, float W, float H, FLinearColor C = FLinearColor(0.f, 0.f, 0.f, 0.55f));
	void Text(const FString& S, float X, float Y, FLinearColor C, float Scale = 1.f, bool bCenter = false, bool bLarge = false);
};
