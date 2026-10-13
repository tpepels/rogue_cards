"""Offline checks for the paid-API illustration generator."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate-illustrations.py"
spec = importlib.util.spec_from_file_location("illustrations", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class IllustrationGeneratorTests(unittest.TestCase):
    def test_no_extra_prompt_content(self):
        style = "illustration in this style:\n\nForgotten Depths\n"
        self.assertEqual(module.make_prompt("Fungal Garden", style),
                         "Fungal Garden\n\n" + style)
        self.assertNotIn("visual hook", module.make_prompt("Fungal Garden", style))

    def test_missing_only_and_stable_names(self):
        cards = [
            {"key": "hero:warrior", "title": "Veteran Warrior",
             "filename": "001_veteran_warrior.png"},
            {"key": "room:m-fungus", "title": "Fungal Garden",
             "filename": "025_fungal_garden.png"},
            {"key": "hero:new", "title": "Another Adventurer", "filename": None},
            {"key": "room:new", "title": "Hall of Moths", "filename": None},
        ]
        with tempfile.TemporaryDirectory() as d:
            Path(d, "001_veteran_warrior.png").write_bytes(b"existing")
            plan = module.plan_cards(cards, Path(d))
            self.assertEqual([c["filename"] for c in plan], [
                "001_veteran_warrior.png", "025_fungal_garden.png",
                "026_another_adventurer.png", "027_hall_of_moths.png"])
            self.assertEqual([c["missing"] for c in plan], [False, True, True, True])
            self.assertFalse(plan[0]["new_mapping"])
            self.assertTrue(plan[2]["new_mapping"])

    def test_append_mapping_does_not_touch_prior_files(self):
        source = '''export const CARD_ART=Object.freeze({\n "hero:warrior":"001_veteran_warrior.png"\n});\nfunction after(){}\n'''
        changed = module.add_mapping(source, "hero:new", "112_new_hero.png")
        self.assertIn('"hero:warrior":"001_veteran_warrior.png",', changed)
        self.assertIn('"hero:new":"112_new_hero.png"', changed)
        self.assertIn("function after(){}", changed)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            module.add_mapping(changed, "hero:new", "113_new_hero.png")

    def test_duplicate_artwork_rejected(self):
        cards = [
            {"key": "hero:a", "title": "A", "filename": "001_a.png"},
            {"key": "hero:b", "title": "B", "filename": "001_a.png"},
        ]
        with self.assertRaisesRegex(ValueError, "Duplicate artwork"):
            module.plan_cards(cards, Path("."))

    def test_slug_matches_existing_convention(self):
        self.assertEqual(module.slug("Warden's Threshold"), "warden_s_threshold")
        self.assertEqual(module.slug("Will-o'-Wisp"), "will_o_wisp")


if __name__ == "__main__":
    unittest.main()
