"""Unit tests for the OpenCV wound-analysis crash path (no DB / network).

The node guards `analyze_with_opencv` in a try/except — this test proves the
unguarded function DOES raise on an unreadable image, which is exactly the
failure mode the node now converts into a safe NORMAL result instead of
crashing the whole check-in pipeline.
"""
import pytest

from app.nodes.vision_agent import analyze_with_opencv


def test_opencv_raises_on_corrupt_image(tmp_path):
    corrupt = tmp_path / "wound.jpg"
    corrupt.write_bytes(b"this is not a real jpeg image payload")
    with pytest.raises(ValueError):
        analyze_with_opencv(str(corrupt))


def test_opencv_raises_on_missing_image(tmp_path):
    missing = tmp_path / "does_not_exist.jpg"
    with pytest.raises(ValueError):
        analyze_with_opencv(str(missing))
