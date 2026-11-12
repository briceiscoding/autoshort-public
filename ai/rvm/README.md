# Robust Video Matting (model code only)

`model/` is copied unchanged from https://github.com/PeterL1n/RobustVideoMatting (GPL-3.0, see LICENSE).
Used by `server/jobs/gpu_matte.py` to cut the speaker out of the rush for `bg` pictures (picture behind the head).
The weights (`rvm_mobilenetv3.pth`, about 15 MB) are downloaded once from the project's v1.0.0 release into `ai/models/`.
