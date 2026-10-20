#include "SWHUD.h"
#include "SWCharacter.h"
#include "SWGameState.h"
#include "SWPlayerState.h"
#include "SWPlayerController.h"
#include "SWWeapons.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"

static const FLinearColor Gold(0.96f, 0.77f, 0.26f);
static const FLinearColor HOABlue(0.23f, 0.51f, 0.96f);
static const FLinearColor Backroad(0.76f, 0.25f, 0.05f);
static FLinearColor TeamColor(uint8 T) { return T == 1 ? HOABlue : T == 2 ? Backroad : FLinearColor::White; }

void ASWHUD::Panel(float X, float Y, float W, float H, FLinearColor C) { DrawRect(C, X, Y, W, H); }

void ASWHUD::Text(const FString& S, float X, float Y, FLinearColor C, float Scale, bool bCenter, bool bLarge)
{
	UFont* F = bLarge ? GEngine->GetLargeFont() : GEngine->GetMediumFont();
	if (bCenter) { float W, H; GetTextSize(S, W, H, F, Scale); X -= W / 2.f; }
	DrawText(S, FLinearColor(0.f, 0.f, 0.f, 0.7f), X + 1.5f, Y + 1.5f, F, Scale);
	DrawText(S, C, X, Y, F, Scale);
}

void ASWHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	ASWGameState* GS = GetWorld()->GetGameState<ASWGameState>();
	ASWPlayerController* PC = Cast<ASWPlayerController>(PlayerOwner);
	ASWCharacter* Me = PlayerOwner ? Cast<ASWCharacter>(PlayerOwner->GetPawn()) : nullptr;
	const float W = Canvas->ClipX, H = Canvas->ClipY;

	if (Me && !Me->bDead)
	{
		// scope overlay for the deer rifle
		if (SWWeapons::Get(Me->WeaponIndex).bScoped && Me->AimAlpha > 0.85f)
		{
			const float R = H * 0.46f;
			Panel(0, 0, W / 2 - R, H, FLinearColor::Black); Panel(W / 2 + R, 0, W / 2 - R, H, FLinearColor::Black);
			DrawLine(W / 2 - R, H / 2, W / 2 + R, H / 2, FLinearColor::Black, 1.5f);
			DrawLine(W / 2, H / 2 - R, W / 2, H / 2 + R, FLinearColor::Black, 1.5f);
		}
		else DrawCrosshair(Me);
		DrawBottom(Me);
		// damage flash
		const float Since = (float)GetWorld()->GetTimeSeconds() - Me->DamageFlashTime;
		if (Since < 0.35f) Panel(0, 0, W, H, FLinearColor(0.8f, 0.f, 0.f, 0.25f * (1.f - Since / 0.35f)));
	}
	if (GS) { DrawTop(GS); DrawFeed(GS); }

	if (PC && PC->bShowDeath)
	{
		Panel(W / 2 - 300, H * 0.62f, 600, 110, FLinearColor(0.05f, 0.05f, 0.06f, 0.8f));
		Panel(W / 2 - 300, H * 0.62f, 600, 4, FLinearColor(0.9f, 0.15f, 0.15f));
		Text(TEXT("NOTICE OF VIOLATION  -  KILLCAM"), W / 2, H * 0.62f + 14, FLinearColor(0.95f, 0.3f, 0.3f), 1.f, true);
		Text(FString::Printf(TEXT("You were fined by %s  (%s)%s"), *PC->DeathBy, *PC->DeathWeapon, PC->bDeathHead ? TEXT("  HEADSHOT") : TEXT("")), W / 2, H * 0.62f + 44, FLinearColor::White, 1.f, true);
		const float Left = GS ? FMath::Max(0.f, PC->RespawnAtServerTime - (float)GS->GetServerWorldTimeSeconds()) : 0.f;
		Text(FString::Printf(TEXT("Respawning in %d..."), FMath::CeilToInt(Left)), W / 2, H * 0.62f + 74, FLinearColor(0.8f, 0.8f, 0.8f), 0.9f, true);
	}
	if (GS && (GS->bMatchOver || (PC && PC->bShowScores))) DrawScoreboard(GS);
	if (GS && GS->bMatchOver)
	{
		Panel(0, H * 0.18f, W, 90, FLinearColor(0.f, 0.f, 0.f, 0.75f));
		Text(FString::Printf(TEXT("%s WINS"), *GS->Winner.ToUpper()), W / 2, H * 0.18f + 18, Gold, 2.f, true, true);
		Text(TEXT("Next map in a few seconds..."), W / 2, H * 0.18f + 64, FLinearColor::White, 0.9f, true);
	}
	// standalone (not hosting yet): how to host / join
	if (GetNetMode() == NM_Standalone)
	{
		Panel(20, H - 230, 520, 120, FLinearColor(0.f, 0.f, 0.f, 0.6f));
		Text(TEXT("SUBURBAN WARFARE  -  practice mode"), 34, H - 220, Gold, 1.f);
		Text(TEXT("F1-F5: host a match (Cul-de-sac, Country Club, Farmstead, Fair, Lake)"), 34, H - 190, FLinearColor::White, 0.8f);
		Text(TEXT("Join a friend: press ~ and type   join <their IP>"), 34, H - 165, FLinearColor::White, 0.8f);
		Text(TEXT("Team match: press ~ and type   host culdesac tdm"), 34, H - 140, FLinearColor::White, 0.8f);
	}
}

void ASWHUD::DrawCrosshair(ASWCharacter* Me)
{
	const float CX = Canvas->ClipX / 2, CY = Canvas->ClipY / 2;
	const float Spread = Me->CurrentSpread();
	const float Move = FMath::Min(1.f, Me->GetVelocity().Size2D() / 940.f);
	const float Gap = (4.f + Spread * 260.f + Move * 9.f + Me->Bloom * 10.f) * (1.f - Me->AimAlpha * 0.7f);
	const float L = 9.f;
	const FLinearColor C(1.f, 1.f, 1.f, 0.9f - Me->AimAlpha * 0.5f);
	DrawLine(CX - Gap - L, CY, CX - Gap, CY, C, 2.f); DrawLine(CX + Gap, CY, CX + Gap + L, CY, C, 2.f);
	DrawLine(CX, CY - Gap - L, CX, CY - Gap, C, 2.f); DrawLine(CX, CY + Gap, CX, CY + Gap + L, C, 2.f);
	// hit marker: white X, red on a kill, gold on a headshot
	const float T = (float)GetWorld()->GetTimeSeconds() - Me->HitMarkerTime;
	if (T < 0.22f)
	{
		const FLinearColor HC = Me->bLastHitKill ? FLinearColor(1.f, 0.2f, 0.2f) : Me->bLastHitHead ? Gold : FLinearColor::White;
		const float A = 7.f, B = Me->bLastHitKill ? 18.f : 14.f;
		DrawLine(CX - B, CY - B, CX - A, CY - A, HC, 2.5f); DrawLine(CX + A, CY - A, CX + B, CY - B, HC, 2.5f);
		DrawLine(CX - B, CY + B, CX - A, CY + A, HC, 2.5f); DrawLine(CX + A, CY + A, CX + B, CY + B, HC, 2.5f);
	}
}

void ASWHUD::DrawBottom(ASWCharacter* Me)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	// health ("property value")
	Panel(30, H - 70, 300, 40);
	const float Hp = FMath::Clamp(Me->Health / 100.f, 0.f, 1.f);
	Panel(40, H - 50, 280 * Hp, 12, Hp > 0.35f ? FLinearColor(0.3f, 0.85f, 0.45f) : FLinearColor(0.95f, 0.25f, 0.2f));
	Text(FString::Printf(TEXT("PROPERTY VALUE  %d"), FMath::RoundToInt(Me->Health)), 40, H - 68, FLinearColor::White, 0.75f);
	// ammo + weapon
	const FSWWeapon& Wp = SWWeapons::Get(Me->WeaponIndex);
	const int32 A = Me->Ammo.IsValidIndex(Me->WeaponIndex) ? Me->Ammo[Me->WeaponIndex] : 0;
	Panel(W - 330, H - 110, 300, 80);
	Text(Wp.Name, W - 315, H - 104, FLinearColor(0.85f, 0.85f, 0.85f), 0.8f);
	Text(Me->bReloading ? TEXT("RELOADING") : FString::Printf(TEXT("%d / %d"), A, Wp.Mag), W - 315, H - 80, A <= Wp.Mag / 4 ? FLinearColor(1.f, 0.4f, 0.3f) : FLinearColor::White, 1.4f, false, true);
	// weapon slots
	float X = W - 330;
	for (int32 i = 0; i < SWWeapons::Num; ++i)
	{
		const bool bOn = i == Me->WeaponIndex;
		const FString Label = FString::Printf(TEXT("%d %s"), i + 1, SWWeapons::Get(i).Short);
		float TW, TH; GetTextSize(Label, TW, TH, GEngine->GetMediumFont(), 0.6f);
		Panel(X, H - 26, TW + 10, 18, bOn ? Gold : FLinearColor(0.f, 0.f, 0.f, 0.5f));
		DrawText(Label, bOn ? FLinearColor::Black : FLinearColor::White, X + 5, H - 25, GEngine->GetMediumFont(), 0.6f);
		X += TW + 14;
		if (X > W - 20) break;
	}
}

void ASWHUD::DrawTop(ASWGameState* GS)
{
	const float W = Canvas->ClipX;
	const int32 S = FMath::CeilToInt(GS->SecondsLeft());
	Panel(W / 2 - 60, 12, 120, 40);
	Text(FString::Printf(TEXT("%d:%02d"), S / 60, S % 60), W / 2, 16, FLinearColor::White, 1.2f, true, true);
	if (GS->bTeamMode)
	{
		Panel(W / 2 - 200, 12, 130, 40, FLinearColor(HOABlue.R, HOABlue.G, HOABlue.B, 0.7f));
		Text(FString::Printf(TEXT("HOA  %d"), GS->TeamScoreHOA), W / 2 - 135, 18, FLinearColor::White, 1.f, true);
		Panel(W / 2 + 70, 12, 130, 40, FLinearColor(Backroad.R, Backroad.G, Backroad.B, 0.7f));
		Text(FString::Printf(TEXT("BACKROAD  %d"), GS->TeamScoreBackroad), W / 2 + 135, 18, FLinearColor::White, 1.f, true);
	}
	Text(FString::Printf(TEXT("%s  -  first to %d"), GS->bTeamMode ? TEXT("Team Deathmatch") : TEXT("Free-for-All"), GS->KillLimit), W / 2, 56, FLinearColor(0.85f, 0.85f, 0.85f), 0.7f, true);
	if (GetWorld()->GetTimeSeconds() - GS->AnnouncementTime < 6.0)
	{
		Panel(W / 2 - 360, 82, 720, 30, FLinearColor(1.f, 0.98f, 0.9f, 0.9f));
		Text(GS->Announcement, W / 2, 87, FLinearColor(0.1f, 0.12f, 0.1f), 0.8f, true);
	}
}

void ASWHUD::DrawFeed(ASWGameState* GS)
{
	const float W = Canvas->ClipX;
	const double Now = GetWorld()->GetTimeSeconds();
	float Y = 70;
	for (int32 i = GS->Feed.Num() - 1; i >= 0; --i)
	{
		const FSWFeedLine& L = GS->Feed[i];
		if (Now - L.Time > 6.0) continue;
		const FString S = FString::Printf(TEXT("%s %s %s  [%s]%s"), *L.Killer, *L.Verb, *L.Victim, *L.Weapon, L.bHead ? TEXT(" HEADSHOT") : TEXT(""));
		float TW, TH; GetTextSize(S, TW, TH, GEngine->GetMediumFont(), 0.75f);
		Panel(W - TW - 40, Y, TW + 20, 24);
		DrawText(S, TeamColor(L.KillerTeam), W - TW - 30, Y + 3, GEngine->GetMediumFont(), 0.75f);
		Y += 28;
	}
}

void ASWHUD::DrawScoreboard(ASWGameState* GS)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	TArray<ASWPlayerState*> List;
	for (APlayerState* PS : GS->PlayerArray) if (ASWPlayerState* S = Cast<ASWPlayerState>(PS)) List.Add(S);
	List.Sort([](const ASWPlayerState& A, const ASWPlayerState& B) { return A.Kills != B.Kills ? A.Kills > B.Kills : A.Deaths < B.Deaths; });
	const float PW = 560, PH = 70 + List.Num() * 30, X = W / 2 - PW / 2, Y = H * 0.3f;
	Panel(X, Y, PW, PH, FLinearColor(0.04f, 0.05f, 0.06f, 0.88f));
	Panel(X, Y, PW, 4, Gold);
	Text(TEXT("NEIGHBORHOOD STANDINGS"), X + 20, Y + 14, Gold, 1.f);
	Text(TEXT("K"), X + PW - 120, Y + 14, FLinearColor::White, 0.9f);
	Text(TEXT("D"), X + PW - 60, Y + 14, FLinearColor::White, 0.9f);
	float RY = Y + 50;
	for (ASWPlayerState* S : List)
	{
		Text(S->GetPlayerName(), X + 20, RY, TeamColor(S->Team), 0.9f);
		Text(FString::FromInt(S->Kills), X + PW - 120, RY, FLinearColor::White, 0.9f);
		Text(FString::FromInt(S->Deaths), X + PW - 60, RY, FLinearColor::White, 0.9f);
		RY += 30;
	}
}
