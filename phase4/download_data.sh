#!/bin/bash
# Downloads TextGrids and BOLD data for one subject (UTS01) from OpenNeuro ds003020
# We use a single subject for regression training — population average assumption
# documented in docs/methodology.md
#
# Run on Vast instance: bash download_data.sh
# Requires: awscli (pip install awscli)

set -e

BUCKET="s3://openneuro.org/ds003020"
SUBJECT="sub-UTS01"
OUT_DIR="./data"

mkdir -p "$OUT_DIR/textgrids"
mkdir -p "$OUT_DIR/bold"

echo "Downloading TextGrids..."
aws s3 sync --no-sign-request \
    "$BUCKET/derivative/TextGrids/" \
    "$OUT_DIR/textgrids/"

echo "Downloading BOLD for $SUBJECT..."
# Sessions 2 onwards contain narrative listening data
# Session 1 is localizer tasks only (CategoryLocalizer, MotorLocalizer)
for ses in ses-2 ses-3 ses-4 ses-5 ses-6 ses-7 ses-8 ses-9 ses-10 ses-11 ses-12 ses-14 ses-15 ses-18 ses-20; do
    aws s3 sync --no-sign-request \
        "$BUCKET/$SUBJECT/$ses/func/" \
        "$OUT_DIR/bold/$ses/" \
        --exclude "*" \
        --include "*.nii.gz" \
        --exclude "*CategoryLocalizer*" \
        --exclude "*MotorLocalizer*" \
        --exclude "*AudioMotorLocalizer*"
done

echo "Done. Contents:"
find "$OUT_DIR/bold" -name "*.nii.gz" | wc -l
echo "BOLD files"
find "$OUT_DIR/textgrids" -name "*.TextGrid" | wc -l
echo "TextGrid files"
