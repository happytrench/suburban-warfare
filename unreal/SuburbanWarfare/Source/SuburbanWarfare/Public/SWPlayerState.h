#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "SWPlayerState.generated.h"

UCLASS()
class SUBURBANWARFARE_API ASWPlayerState : public APlayerState
{
	GENERATED_BODY()

public:
	/** 0 = free-for-all, 1 = Pristine Pines HOA, 2 = Backroad Boys */
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") uint8 Team = 0;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") int32 Kills = 0;
	UPROPERTY(Replicated, BlueprintReadOnly, Category = "SW") int32 Deaths = 0;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
