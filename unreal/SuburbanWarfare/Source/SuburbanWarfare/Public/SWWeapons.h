// Weapon table ported 1:1 from the browser game (client/shared/constants.js).
// Distances are metres here and converted to centimetres where Unreal needs them.
#pragma once

#include "CoreMinimal.h"

struct FSWWeapon
{
	const TCHAR* Id;
	const TCHAR* Name;
	const TCHAR* Short;
	float Damage;
	float HeadMult;
	float CooldownSec;
	int32 Mag;
	float ReloadSec;
	float Spread;      // radians, cone half-angle (hip)
	float HipSpread;   // scoped weapons only: hip-fire spread; 0 = use Spread
	int32 Pellets;
	float RangeM;
	float FalloffStartM;
	float FalloffMin;
	bool bAuto;
	bool bScoped;
	// recoil per shot (degrees): climb, extra climb per burst round, side drift
	float RecoilUp;
	float RecoilClimb;
	float RecoilSide;
};

namespace SWWeapons
{
	static constexpr int32 Num = 6;
	static constexpr float AdsSpreadMult = 0.55f;

	inline const FSWWeapon& Get(int32 Index)
	{
		static const FSWWeapon Table[Num] = {
			// id        name                         short           dmg   head  cd     mag reload spread  hip    pel range  fall  fmin  auto   scope  up     climb   side
			{ TEXT("rifle"),  TEXT("Leaf Blaster 3000"),       TEXT("BLASTER"),      22.f, 1.6f, 0.100f, 30, 1.7f, 0.012f, 0.f,   1, 160.f, 160.f, 1.0f,  true,  false, 0.26f, 0.009f, 0.15f },
			{ TEXT("ak"),     TEXT("Bush Hog AK"),             TEXT("BUSH HOG"),     30.f, 1.6f, 0.125f, 30, 2.0f, 0.016f, 0.f,   1, 150.f,  70.f, 0.75f, true,  false, 0.39f, 0.013f, 0.21f },
			{ TEXT("smg"),    TEXT("Weed Whacker MP"),         TEXT("WEED WHACKER"), 16.f, 1.5f, 0.070f, 32, 1.6f, 0.022f, 0.f,   1,  80.f,  22.f, 0.55f, true,  false, 0.18f, 0.006f, 0.17f },
			{ TEXT("shotgun"),TEXT("HOA Enforcer"),            TEXT("ENFORCER"),     15.f, 1.4f, 0.850f,  6, 2.3f, 0.075f, 0.f,   8,  45.f,  12.f, 0.4f,  false, false, 1.83f, 0.f,    0.40f },
			{ TEXT("deer"),   TEXT("Deer Rifle (.30-06)"),     TEXT("DEER RIFLE"),   75.f, 2.0f, 1.100f,  5, 2.6f, 0.0025f,0.06f, 1, 240.f, 240.f, 1.0f,  false, true,  2.86f, 0.f,    0.34f },
			{ TEXT("pistol"), TEXT("Neighborhood Watch 9mm"),  TEXT("WATCH 9MM"),    28.f, 1.8f, 0.160f, 15, 1.3f, 0.012f, 0.f,   1,  90.f,  30.f, 0.6f,  false, false, 0.80f, 0.f,    0.23f },
		};
		return Table[FMath::Clamp(Index, 0, Num - 1)];
	}
}
