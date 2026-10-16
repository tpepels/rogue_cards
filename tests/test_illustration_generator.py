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

    def test_physical_catalogue_covers_print_only_cards(self):
        cards = module.get_catalogue()
        self.assertEqual(len(cards), 175)
        self.assertEqual(len(set(card["key"] for card in cards)), 175)
        canonical = [c for c in cards if c["mapping_source"] == "canonical"]
        expansion = [c for c in cards if c["mapping_source"] == "print-only"]
        self.assertEqual(len(canonical), 139)
        self.assertEqual(len(expansion), 36)
        self.assertEqual(len({c["key"] for c in expansion}), 36)
        new_monsters = [c for c in expansion if c["key"].startswith("monster:")]
        self.assertEqual(len(new_monsters), 12)
        self.assertEqual(len([c for c in expansion if not c["filename"]]), 12)
        self.assertEqual([c["number"] for c in new_monsters], list(range(164, 176)))
        self.assertEqual(module.mapping_target(expansion[0])[1], "PRINT_ONLY_ART")
        self.assertEqual(module.mapping_target(new_monsters[0])[1], "PRINT_ONLY_ART")

    def test_new_monster_illustrations_get_stable_164_to_175_numbers(self):
        cards = module.get_catalogue()
        with tempfile.TemporaryDirectory() as tmp:
            art_dir = Path(tmp)
            for card in cards:
                if card["filename"]:
                    Path(art_dir, card["filename"]).touch()
            planned = module.plan_cards(cards, art_dir)
            monsters = [c for c in planned if c["mapping_source"] == "print-only"
                        and c["key"].startswith("monster:")]
            self.assertEqual(len(monsters), 12)
            self.assertTrue(all(c["missing"] for c in monsters))
            self.assertEqual(monsters[0]["filename"], "164_drain_leech.png")
            self.assertEqual(monsters[-1]["filename"], "175_glass_revenant.png")
            self.assertTrue(all(c["new_mapping"] for c in monsters))
            self.assertEqual(sum(c["missing"] for c in planned), 12)
            # Generate card 175 before 164; existing indices must stay stable.
            Path(art_dir, monsters[-1]["filename"]).touch()
            updated = [dict(c) for c in cards]
            updated[-1]["filename"] = monsters[-1]["filename"]
            repeated = module.plan_cards(updated, art_dir)
            self.assertEqual([c["filename"] for c in repeated[-12:]],
                             [c["filename"] for c in planned[-12:]])
            self.assertEqual(sum(c["missing"] for c in repeated), 11)


if __name__ == "__main__":
    unittest.main()
