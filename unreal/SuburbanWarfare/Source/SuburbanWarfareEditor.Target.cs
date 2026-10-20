using UnrealBuildTool;

public class SuburbanWarfareEditorTarget : TargetRules
{
	public SuburbanWarfareEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SuburbanWarfare");
	}
}
