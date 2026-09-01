# 3D navigator preview images

The card on `/navigation` cross-fades through these renders of the CS block.

Current set (edit `SHOTS` in `src/components/navigation/NavigatorShowcase.tsx` to add,
remove or reorder — each entry carries its own alt text, so update that too):

| File            | View |
| --------------- | ---- |
| `3d_pic_1.png`  | Floors pulled apart, rooms visible from above |
| `3d_pic_2.png`  | Finished exterior with roof and glass facade |
| `3d_pic_3.png`  | Cut open along its length, rooms behind the facade |
| `3d_pic_4.png`  | All four floors head-on, glazed stair/lift core |
| `3d_pic_5.png`  | Stacked floors from overhead |
| `3d_pic_6.png`  | A single floor with every room labelled |

Notes for replacing these:

- **Background must be `#EFE9DC`.** The card panel is painted the same colour so the
  letter-boxing is invisible — a render on white would show as a bright rectangle.
  `FRAME_BG` in `NavigatorShowcase.tsx` and the panel class in `ThreeDNavigatorCard.tsx`
  must stay in sync if that ever changes.
- Landscape works best; anything from about 5:3 to 2:1 fills the panel well. Images are
  contained, never cropped.
- Any file that fails to load is skipped, and if none load the card falls back to an
  exploded axonometric drawn from the building data — so it is never a broken image.
- They are fetched only once the card nears the viewport, and one at a time. Keep each
  under ~400 kB.
