# CSS debugging styles

Adapted from [Pesticide](https://github.com/mrmrs/pesticide), npm version 1.3.1, by Adam Morse (@mrmrs) and contributors.
The original MIT license is included in [LICENSE](./LICENSE).

- `pesticide.css` preserves the original element outline colors, but removes all depth declarations.
- `pesticide-depth.css` preserves the original shadows and translucent backgrounds, grouping identical rules and removing obsolete vendor prefixes.

Pesticide's original `css/pesticide.css` includes both effects.
These files deliberately keep them separate so the CSS Outlining and CSS Depth Outlining controls work independently, including when both are enabled.
Disabling a control removes its stylesheet rather than resetting styles authored by the page.

The filenames and HTTP routes remain compatible with existing clients.
These stylesheets and their license ship with the package; no Pesticide runtime dependency or CSS generation is needed.
