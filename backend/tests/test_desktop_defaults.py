"""The product profile starts empty and can import IFC without feature switches."""

from app.settings import Settings


def test_desktop_is_a_real_project_environment_with_ifc_enabled():
    settings = Settings(profile="desktop")
    assert not settings.seed_demo
    assert settings.bim == "ifcopenshell"
    # Demo remains an explicit regression/tutorial choice.
    assert Settings(profile="desktop", seed_demo=True, bim="structured").seed_demo
