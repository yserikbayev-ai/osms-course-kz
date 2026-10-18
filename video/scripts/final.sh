#!/bin/bash
# Финальный рендер 1920×1080 + копия на Drive + лист кадров по готовому файлу.
# bash scripts/final.sh L1.2
set -e
cd "$(dirname "$0")/.."
L=$1
DRIVE="/Users/yerzhanserikbayev/Library/CloudStorage/GoogleDrive-yserikbayev@gmail.com/My Drive/00 Проекты/Medical Registration/03_Артефакты/video"
npx remotion render OsmsLesson "out/$L.mp4" --props="props/$L.json" --codec=h264 --log=error
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate:format=duration -of default=nw=1 "out/$L.mp4"
mkdir -p "$DRIVE"
cp "out/$L.mp4" "$DRIVE/$L.mp4"
ls -la "$DRIVE/$L.mp4"
python3 -P scripts/sheet.py "$L" --video "out/$L.mp4" --tag final | tail -2
