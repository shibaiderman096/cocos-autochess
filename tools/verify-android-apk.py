"""Check the packaged runtime and configuration against this checkout without a device."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import zipfile


def contains(value, expected):
    if value == expected:
        return True
    children = value.values() if isinstance(value, dict) else value if isinstance(value, list) else []
    return any(contains(child, expected) for child in children)


def verify(apk, project):
    with zipfile.ZipFile(apk) as archive:
        assert archive.testzip() is None, "APK ZIP integrity check failed"
        names = archive.namelist()
        launcher = archive.read("assets/application.js").decode("utf-8")
        assert re.search(r"this\.showFPS\s*=\s*false\s*;", launcher), "Android performance overlay must be disabled"
        libraries = [name for name in names if name.endswith(".so")]
        assert libraries == ["lib/arm64-v8a/libcocos.so"], libraries
        prefix = "assets/assets/resources/"
        registry = json.loads(archive.read(prefix + "cc.config.json"))
        paths = {entry[0]: uuid for uuid, entry in registry["paths"].items()}
        configs = []
        for name in ["battle", "units", "skills", "run", "enemy-roles", "equipment"]:
            uuid = paths["config/" + name]
            packed = json.loads(archive.read(prefix + "import/" + uuid[:2] + "/" + uuid + ".json"))
            expected = json.loads((project / "assets/resources/config" / (name + ".json")).read_text(encoding="utf-8"))
            assert contains(packed, expected), "Packaged config differs: " + name
            configs.append(name)
        images = ["art/units/astral/milu", "art/units/astral/star_armor_guard"] + [
            "art/fx/" + name for name in ["stellar_barrier", "stellar_rush", "milu_star_trail", "milu_star_impact",
                                        "astral_tile", "astral_ring", "astral_meteor", "astral_impact",
                                        "milu_skill_sheet", "stellar_skill_sheet", "moon_arrow_sheet",
                                        "nebula_tide_sheet", "gravity_collapse_sheet",
                                        "crimson_upheaval", "bloodline_siphon", "voidscar_transit", "frostblood_roar",
                                        "scarlet_aid", "blood_rebirth", "blood_cleave", "bloodfiend_revel",
                                        "mechanical_overclock"]] + ["art/ui/loading_emblem"] + [
            "art/units/bloodfiend/" + name for name in ["crimson_riftclaw", "bloodline_earl", "crimson_devourer",
                                                       "scarlet_enchantress", "crimson_demon_knight"]]
        images += ["art/units/explorer/" + name for name in ["startrail_fox", "starlamp_guide", "windlance_huntress",
                                                           "wayward_alchemist", "sandsea_navigator", "hushrope_ranger"]]
        images += ["art/fx/explorer/" + name for name in ["startrail_inspiration", "lone_lantern_guard", "windward_hunt",
                                                        "wayward_corrosion", "sand_compass", "rope_shadow_hunt"]]
        images += ["art/equipment/" + name for name in ["replicator_glimmer", "replicator_starlight",
                                                       "replicator_firmament", "expedition_command_crown"]]
        images += ["art/equipment/stat_boost_" + stat + "_" + tier for stat in ["health", "physical", "spell"]
                   for tier in ["small", "medium", "large", "super"]]
        images += ["art/fx/player_damage/player_damage_energy", "art/ui_m2/streak_win", "art/ui_m2/streak_loss"]
        images += ["art/units/demon/" + name for name in ["azaroth", "redhorn_imp", "hellflame_hound", "saien",
                                                            "infernal_axe_guard", "raven_succubus", "crimson_gunslinger", "thornchain_succubus"]]
        images += ["art/units/astral/star_ring_sage"]
        images += ["art/fx/" + name for name in ["demon_azaroth", "redhorn_fervor", "hellhound_breath", "abyss_verdict",
                                               "infernal_axe", "raven_soul_theft", "infernal_gunfire", "thornchain_pull", "star_ring_sage"]]
        for image in images:
            assert image + "/spriteFrame" in paths, "Missing packaged sprite: " + image
            uuid = paths[image]
            assert any(name.startswith(prefix + "native/" + uuid[:2] + "/" + uuid + ".") for name in names), image
        runtime = archive.read("assets/assets/main/index.js").decode("utf-8")
        for token in ["milu_star_leap", "stellar_bulwark", "milu_skill_sheet", "stellar_skill_sheet", "GameLoadingOverlay",
                      "bloodfiend_revel", "mechanical_overclock", "blood_cleave_charge", "attackWindupSeconds",
                      "grantExplorerReward", "openExplorerChest",
                      "flyMixedChestRewards", "explorerGoldThreshold", "equipmentDescriptionRichText",
                      "forgeEnhance", "forgeEnhanceTen", "FORGE_ATTACK_SPEED_CAP", "dicePick_", "validDicePicks", "beginDiceBet", "restoreMerchantServices",
                      "stageShopQualityRates", "explorerLootQualityRates", "setLootCaption", "moveSummon", "summonPositions",
                      "demonPosition", "thornchain_pull", "runic_missiles", "explorerLootStarRates", "chestUnitValue"]:
            assert token in runtime, "Missing packaged behavior: " + token
        assert "tankDistanceBias" not in runtime, "Obsolete distance-discount targeting was packaged"
        assert "art/units/sunlight/seraphiel" not in paths, "Removed Seraphiel portrait was packaged"
        main = json.loads(archive.read("assets/assets/main/cc.config.json"))
        scenes = sorted(main["scenes"])
        assert scenes == ["db://assets/floating-ruins.scene", "db://assets/main.scene"], scenes
    return {"apk": str(apk.resolve()), "bytes": apk.stat().st_size,
            "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(), "zipIntegrity": "pass",
            "libraries": libraries, "exactSourceConfigs": configs, "packagedImages": images,
            "scenes": scenes, "runtimeBehaviors": "pass", "deviceRun": "not performed"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = verify(args.apk, Path(__file__).resolve().parent.parent)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
