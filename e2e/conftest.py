import os
from pathlib import Path

import pytest

# Ensure the screenshots directory exists before any test runs.
Path("e2e-screenshots").mkdir(exist_ok=True)


@pytest.fixture(scope="session")
def base_url() -> str:
    """Mirror the PLAYWRIGHT_BASE_URL env var used by the TypeScript suite."""
    return os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost:4200")


@pytest.fixture(autouse=True)
def setup(page):
    """Replicate test.beforeEach: navigate, wait for Cesium, enter edit mode."""
    page.goto("/")
    page.wait_for_timeout(3000)

    # Dismiss Cesium error panel if present.
    error_panel = page.locator(".cesium-widget-errorPanel")
    try:
        if error_panel.is_visible(timeout=1000):
            btn = error_panel.locator("button")
            if btn.is_visible(timeout=500):
                btn.click(force=True)
                page.wait_for_timeout(500)
    except Exception:
        pass

    # Enter edit mode.
    page.locator(".mode-btn").first().click(force=True)
    page.wait_for_timeout(500)
