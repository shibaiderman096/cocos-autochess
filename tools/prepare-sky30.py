"""Finish 30 image-model painted phases; no generated scenery or translated stills.

Source sheets are preserved. Fixed island cores come from the first source frame;
only cloud pixels use the painted sequence, with cyclic temporal denoising.
Run before generate2dsprite/assemble_frames.py. Refuses an existing frames folder.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter1d

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art-source/sky-islands-30-v2'
SIZE = (640, 360)
REGIONS = {
    'left_arch_and_island': [0, 0, 224, 221],
    'left_distant_island': [0, 160, 100, 280],
    'left_bridge': [195, 43, 245, 140],
    'right_arch_and_island': [470, 0, 640, 238],
    'lower_right_island': [500, 210, 640, 360],
    'distant_upper_tower': [448, 10, 489, 100],
}


def main():
    frames_dir = OUT / 'finished-frames'
    if frames_dir.exists():
        raise FileExistsError('Keep accepted frames: use a new source version before rebuilding.')
    raw_dir = OUT / 'cropped'
    raw_dir.mkdir(exist_ok=False)
    raw, crops = [], []
    for first in range(0, 30, 6):
        file = OUT / f'frames-{first:02}-{first+5:02}-source.png'
        sheet = Image.open(file).convert('RGB')
        w, h = sheet.size
        for j in range(6):
            x, y = j % 2, j // 2
            box = [round(x*w/2), round(y*h/3), round((x+1)*w/2), round((y+1)*h/3)]
            image = sheet.crop(box).resize(SIZE, Image.Resampling.LANCZOS)
            image.save(raw_dir / f'frame-{first+j:02}.png')
            raw.append(np.asarray(image, dtype=np.float32))
            crops.append({'frame': first+j, 'source': file.name, 'source_size': [w,h], 'crop': box, 'finished_size': list(SIZE)})
    pixels = np.stack(raw)
    plate = pixels[0]
    protected = Image.new('L', SIZE, 0)
    draw = ImageDraw.Draw(protected)
    for box in REGIONS.values():
        draw.rectangle((box[0], box[1], box[2]-1, box[3]-1), fill=255)
    protected_arr = np.asarray(protected) > 0
    # No bright/dark switching between model batches. Keep each cloud's local painting.
    cloud = ~protected_arr
    means = pixels[:, cloud, :].mean(axis=1)
    corrected = np.clip(pixels + (means.mean(axis=0)-means)[:,None,None,:], 0, 255)
    smooth = gaussian_filter1d(corrected, sigma=2.4, axis=0, mode='wrap')
    distance = distance_transform_edt(cloud)
    alpha = (np.clip(distance/14, 0, 1)*.78)[...,None]
    finished = np.floor(plate[None]*(1-alpha)+smooth*alpha+.5).clip(0,255).astype(np.uint8)
    assert np.max(np.abs(finished[:,protected_arr,:].astype(int)-plate[protected_arr,:].astype(int))) == 0
    # A loop's initial phase is arbitrary. Start after the gentlest transition;
    # every one of the 30 transitions is still measured, not only the chosen seam.
    steps = np.abs(finished.astype(np.float32)-np.roll(finished.astype(np.float32),1,axis=0)).mean(axis=(1,2,3))
    start = int(np.argmin(steps))
    finished = np.roll(finished, -start, axis=0)
    frames_dir.mkdir()
    hashes = []
    for index, frame in enumerate(finished):
        path = frames_dir / f'frame-{index:02}.png'
        Image.fromarray(frame).save(path)
        hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
    assert len(set(hashes)) == 30, 'All 30 painted phases must remain distinct.'
    delta = np.abs(finished.astype(np.float32)-np.roll(finished.astype(np.float32),-1,axis=0)).mean(axis=(1,2,3))
    mean = float(np.mean(delta[:-1]))
    qa = {
        'art_source': 'host_image', 'route': 'image_gen', 'model': None, 'estimateUsd': None,
        'frames': 30, 'unique_frames': len(set(hashes)), 'frame_size': list(SIZE), 'fps': 15, 'duration_seconds': 2,
        'source_sheets': 5, 'source_drawings': 30, 'source_crop_boxes': crops,
        'processing': {'cyclic_temporal_sigma_frames': 2.4, 'cloud_alpha': .78, 'feather_px': 14,
                       'global_color_mean_normalization': True, 'start_source_phase': start,
                       'camera_or_still_pan': False, 'frame_interpolation': False,
                       'note': 'Each delivered phase uses neighboring painted phases for denoising; islands are fixed from source frame0. No synthesized in-between frames.'},
        'protected_core_max_delta': 0, 'protected_threshold': 0,
        'all_30_rgb_mae_steps': [float(x) for x in delta], 'max_step': float(delta.max()),
        'max_step_threshold': 3.0, 'adjacent_mean': mean, 'seam_mae': float(delta[-1]),
        'wrap_ratio': float(delta[-1])/mean, 'wrap_ratio_threshold': 1.0,
        'luma_step_max': float(np.abs(np.diff(finished.mean(axis=(1,2,3)))) .max()),
        'mask_mean_opacity': float(alpha.mean()), 'pixel_hashes': hashes,
        'visual_approval': False,
    }
    assert qa['max_step'] <= qa['max_step_threshold'], qa
    assert qa['wrap_ratio'] <= qa['wrap_ratio_threshold'], qa
    Image.fromarray((alpha[...,0]*255).round().astype(np.uint8)).save(OUT/'motion-mask.png')
    overlay = (plate*.6+np.array([20,220,220])*alpha*.4).clip(0,255).astype(np.uint8)
    Image.fromarray(overlay).save(OUT/'motion-mask-review.png')
    (OUT/'static-regions.json').write_text(json.dumps(REGIONS, indent=2), encoding='utf-8')
    (OUT/'finish-qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    review = Image.new('RGB',(640*5,360*6))
    for i, frame in enumerate(finished): review.paste(Image.fromarray(frame), ((i%5)*640,(i//5)*360))
    review.save(OUT/'contact-sheet.png')
    print(json.dumps({k:qa[k] for k in ['frames','unique_frames','protected_core_max_delta','max_step','wrap_ratio','mask_mean_opacity']}))


if __name__ == '__main__':
    main()
