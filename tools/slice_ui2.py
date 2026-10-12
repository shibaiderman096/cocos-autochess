# -*- coding: utf-8 -*-
"""
从 03_UI组件透明图集.png 裁切独立组件 PNG（坐标已用 debug 裁图校准）。
原图 1312x1199。输出：assets/resources/art/ui2/sliced/
"""
from PIL import Image
import os

SRC = r"D:\cocos\NewProject\assets\resources\art\ui2\03_UI组件透明图集.png"
OUT = r"D:\cocos\NewProject\assets\resources\art\ui2\sliced"
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert("RGBA")

# debug crops offsets（用于换算）：buttons crop 起点 (1130,540)
# 图中按钮（2x 图 364x620 → 原图 /2 + 1130,540）:
# 开始战斗 y 100-195 → 原 590-637；按钮 x 30-330 → 原 1145-1295
CROPS = [
    # 按钮（x 1145-1295，间距 ~57px，从 y=590 起）
    ("btn_fight",      1145, 590, 1296, 638),
    ("btn_refresh",    1145, 648, 1296, 696),
    ("btn_buy",        1145, 706, 1296, 754),
    ("btn_sell",       1145, 763, 1296, 811),
    ("btn_cancel",     1145, 820, 1296, 868),
    # 面板（panels.png 起点 (0,150)）：本回合结算 x 8-243 y 168-475 → 原
    ("panel_economy",    8, 168, 243, 478),
    ("panel_level",    268, 168, 503, 478),
    # 商店卡（shopcards.png 起点 (500,160)）：卡 x 18-128/143-253/... y 12-190 → 原 x+500 y+160
    ("shop_card1",     518, 172, 628, 350),
    ("shop_card2",     643, 172, 753, 350),
    ("shop_card3",     768, 172, 878, 350),
    ("shop_card4",     893, 172, 1003, 350),
    ("shop_card5",    1018, 172, 1128, 350),
    ("btn_shop_refresh", 652, 368, 748, 398),
    # 备战席（bench.png 起点 (500,410)）：槽 y 32-95 → 原 442-505；空槽 x 320-384 → 原 820-884
    ("bench_slot",     820, 442, 884, 506),
    ("bench_slot_occ", 508, 442, 572, 506),
    # 格子状态（hexes_2x crop 起点 (960,550)，2x → /2）：六边 x 40-115 → 原 980-1017
    # 可放置 y 78-152 → 原 589-626；间距 80/2=40? 实际行距(2x)80 → 原 40... 需细调：
    # 2x 图中：可放置六边 y 80-150，己方 y 178-250，敌方 y 278-350，不可 375-445，选中 470-540
    # → 原 y = 550 + (y2x/2): 可放置 590-625, 己方 639-675, 敌方 689-725, 不可 737-772, 选中 785-820
    # 六边 x 2x 40-118 → 原 980-1019
    ("hex_placeable",   979, 589, 1020, 626),
    ("hex_own",         979, 638, 1020, 676),
    ("hex_enemy",       979, 688, 1020, 726),
    ("hex_blocked",     979, 736, 1020, 773),
    ("hex_selected",    979, 784, 1020, 821),
    # 提示框（hexes 2x 图 y 590-660 → 原 845-880）
    ("panel_warn",      966, 842, 1150, 884),
    ("toast_gold",     1158, 930, 1312, 966),
    # 顶部栏（topbar.png 起点 (0,20)）：栏 x 10-655 y 12-85 → 原 22-92
    ("top_bar",          10, 30, 656, 106),
    # 经验条（panel_level 内）：条 x 340-470 y 185-210 → 原
    ("expbar_bg",      338, 184, 470, 212),
    # 胜利横幅（bottom.png 起点 (0,930)）：横幅 x 936-1112 y 60-145 → 原 990-1075
    ("panel_result",   936, 988, 1114, 1076),
    # 图标（bottom 区）：金币 1费 icon x 541-577 y 952-990（原）
    ("cost_icon_1",    541, 952, 578, 990),
    ("cost_icon_2",    637, 952, 674, 990),
    ("cost_icon_3",    733, 952, 770, 990),
    ("cost_icon_4",    829, 952, 866, 990),
    ("cost_icon_5",    925, 952, 962, 990),
    # 星（bottom：x 910-990 y 1080-1118）
    ("icon_star_gold",  910, 1080, 948, 1118),
    ("icon_star_gray",  952, 1080, 990, 1118),
    # 金币（bottom：x 18-56 y 1080-1118）
    ("icon_coin",        18, 1080, 56, 1118),
    # 经验 icon（bottom x 545-580）
    ("icon_exp",        545, 1080, 580, 1118),
]

ok, fail = 0, 0
for name, l, t, r, b in CROPS:
    try:
        crop = im.crop((l, t, r, b))
        # 自动 trim 透明边（留 2px 余量）
        bbox = crop.getbbox()
        if bbox:
            pad = 2
            l2 = max(0, bbox[0] - pad); t2 = max(0, bbox[1] - pad)
            r2 = min(crop.width, bbox[2] + pad); b2 = min(crop.height, bbox[3] + pad)
            crop = crop.crop((l2, t2, r2, b2))
        crop.save(os.path.join(OUT, f"{name}.png"))
        ok += 1
        print(f"OK  {name}: {crop.width}x{crop.height}")
    except Exception as e:
        fail += 1
        print(f"ERR {name}: {e}")

print(f"\n{ok} sliced, {fail} failed -> {OUT}")
