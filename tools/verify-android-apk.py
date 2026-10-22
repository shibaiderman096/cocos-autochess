"""Check the packaged runtime and configuration against this checkout without a device."""
import argparse
import hashlib
import json
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
        libraries = [name for name in names if name.endswith(".so")]
        assert libraries == ["lib/arm64-v8a/libcocos.so"], libraries
        prefix = "assets/assets/resources/"
        registry = json.loads(archive.read(prefix + "cc.config.json"))
        paths = {entry[0]: uuid for uuid, entry in registry["paths"].items()}
        configs = []
        for name in ["battle", "units", "skills", "run", "enemy-roles"]:
            uuid = paths["config/" + name]
            packed = json.loads(archive.read(prefix + "import/" + uuid[:2] + "/" + uuid + ".json"))
            expected = json.loads((project / "assets/resources/config" / (name + ".json")).read_text(encoding="utf-8"))
            assert contains(packed, expected), "Packaged config differs: " + name
            configs.append(name)
        images = ["art/units/astral/milu", "art/units/astral/star_armor_guard"] + [
            "art/fx/" + name for name in ["stellar_barrier", "stellar_rush", "milu_star_trail", "milu_star_impact",
                                        "astral_tile", "astral_ring", "astral_meteor", "astral_impact"]]
        for image in images:
            assert image + "/spriteFrame" in paths, "Missing packaged sprite: " + image
            uuid = paths[image]
            assert any(name.startswith(prefix + "native/" + uuid[:2] + "/" + uuid + ".") for name in names), image
        runtime = archive.read("assets/assets/main/index.js").decode("utf-8")
        for token in ["milu_star_leap", "stellar_bulwark", "milu_star_impact", "stellar_barrier"]:
            assert token in runtime, "Missing packaged behavior: " + token
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
