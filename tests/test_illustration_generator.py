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
        with self.assertRaisesRegex(ValueError, "mapping changed"):
            module.add_mapping(changed, "hero:new", "113_new_hero.png")

    def test_provisional_art_is_recognised_as_missing(self):
        cards = [
            {"key": "room:fungus", "title": "Fungal Garden",
             "filename": "025_fungal_garden.png"},
            {"key": "room:new", "title": "Mossy Corridor",
             "filename": "025_fungal_garden.png"},
            {"key": "room:newer", "title": "Old Vault",
             "filename": "025_fungal_garden.png"},
        ]
        with tempfile.TemporaryDirectory() as d:
            Path(d, "025_fungal_garden.png").write_bytes(b"original")
            plan = module.plan_cards(cards, Path(d))
            self.assertEqual([c["filename"] for c in plan],
                             ["025_fungal_garden.png",
                              "026_mossy_corridor.png", "027_old_vault.png"])
            self.assertEqual([c["missing"] for c in plan], [False, True, True])
            self.assertEqual(plan[1]["previous_filename"], "025_fungal_garden.png")
            self.assertTrue(plan[1]["new_mapping"])
            self.assertFalse(plan[0]["new_mapping"])

    def test_repeated_owned_artwork_rejected(self):
        cards = [
            {"key": "room:a", "title": "Fungal Garden",
             "filename": "025_fungal_garden.png"},
            {"key": "room:b", "title": "Fungal Garden",
             "filename": "025_fungal_garden.png"},
        ]
        with self.assertRaisesRegex(ValueError, "Duplicate owned artwork"):
            module.plan_cards(cards, Path("."))

    def test_replace_borrowed_art_mapping_without_affecting_others(self):
        source = (
            'export const CARD_ART=Object.freeze({\n'
            ' "room:original":"025_fungal_garden.png",\n'
            ' "room:new":"025_fungal_garden.png"\n'
            '});\n'
        )
        changed = module.add_mapping(source, "room:new",
                                     "112_mossy_corridor.png",
                                     "025_fungal_garden.png")
        self.assertIn('"room:original":"025_fungal_garden.png"', changed)
        self.assertIn('"room:new":"112_mossy_corridor.png"', changed)
        self.assertEqual(changed.count('"room:new"'), 1)
        with self.assertRaisesRegex(ValueError, "mapping changed"):
            module.add_mapping(changed, "room:new",
                               "113_other.png", "025_fungal_garden.png")

    def test_slug_matches_existing_convention(self):
        self.assertEqual(module.slug("Warden's Threshold"), "warden_s_threshold")
        self.assertEqual(module.slug("Will-o'-Wisp"), "will_o_wisp")


    def test_print_only_art_updates_its_own_map(self):
        source = (
            'export const PRINT_ONLY_ART=Object.freeze({\n'
            ' "room:ex-u-guard-cell":"131_the_hollow_knight.png",\n'
            ' "item:ex-bandages":"110_antidote.png"\n'
            '});\n'
        )
        updated = module.add_mapping(
            source, "room:ex-u-guard-cell", "140_empty_guard_cell.png",
            "131_the_hollow_knight.png", "PRINT_ONLY_ART"
        )
        self.assertIn('"room:ex-u-guard-cell":"140_empty_guard_cell.png"', updated)
        self.assertIn('"item:ex-bandages":"110_antidote.png"', updated)
        self.assertEqual(updated.count('"room:ex-u-guard-cell"'), 1)

    def test_missing_monster_mapping_is_appended_only_after_generation(self):
        source = (
            'export const PRINT_ONLY_ART=Object.freeze({\n'
            ' "item:ex-buckler":"163_wooden_buckler.png"\n'
            '});\n'
        )
        mapped = module.add_mapping(source, "monster:drain-leech",
                                    "164_drain_leech.png", None, "PRINT_ONLY_ART")
        self.assertIn('"item:ex-buckler":"163_wooden_buckler.png",', mapped)
        self.assertIn('"monster:drain-leech":"164_drain_leech.png"', mapped)
        self.assertEqual(mapped.count('"monster:drain-leech"'), 1)

    def test_full_physical_catalogue_includes_all_18_unillustrated_items(self):
        cards = module.get_catalogue()
        self.assertEqual(len(cards), 193)
        self.assertEqual(len({c["key"] for c in cards}), 193)
        self.assertEqual(sum(c["mapping_source"] == "canonical" for c in cards), 139)
        expansion = [c for c in cards if c["mapping_source"] == "print-only"]
        self.assertEqual(len(expansion), 54)
        monsters = [c for c in expansion if c["key"].startswith("monster:")]
        odd_items = [c for c in expansion if c["key"].startswith("item:odd-")]
        self.assertEqual(len(monsters), 12)
        self.assertEqual(len(odd_items), 18)
        self.assertEqual([c["number"] for c in monsters], list(range(164, 176)))
        self.assertEqual([c["number"] for c in odd_items], list(range(176, 194)))
        for card in monsters + odd_items:
            if card["filename"] is not None:
                self.assertEqual(card["filename"],
                                 f"{card['number']:03d}_{module.slug(card['title'])}.png")
        self.assertTrue(all(module.mapping_target(c)[1] == "PRINT_ONLY_ART"
                            for c in expansion))

    def test_missing_new_art_is_numbered_164_to_193_even_after_partial_runs(self):
        all_cards = module.get_catalogue()
        cards = [dict(c, filename=None) if c.get("number") is not None
                 else dict(c) for c in all_cards]
        with tempfile.TemporaryDirectory() as tmp:
            art_dir = Path(tmp)
            for c in cards:
                if c["filename"]:
                    Path(art_dir, c["filename"]).touch()
            planned = module.plan_cards(cards, art_dir)
            extra = [c for c in planned if c.get("number") is not None]
            self.assertEqual(len(extra), 30)
            self.assertEqual(sum(c["missing"] for c in planned), 30)
            self.assertEqual(extra[0]["filename"], "164_drain_leech.png")
            self.assertEqual(extra[11]["filename"], "175_glass_revenant.png")
            self.assertEqual(extra[12]["filename"], "176_loaded_coin.png")
            self.assertEqual(extra[-1]["filename"], "193_red_string.png")
            Path(art_dir, extra[-1]["filename"]).touch()
            updated = [dict(c) for c in cards]
            updated[-1]["filename"] = extra[-1]["filename"]
            again = module.plan_cards(updated, art_dir)
            self.assertEqual([c["filename"] for c in again[-30:]],
                             [c["filename"] for c in planned[-30:]])
            self.assertEqual(sum(c["missing"] for c in again), 29)


if __name__ == "__main__":
    unittest.main()
