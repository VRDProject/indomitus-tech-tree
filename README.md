# Indomitus Tech Tree
https://vrdproject.github.io/indomitus-tech-tree

[Open the interactive tech tree](https://vrdproject.github.io/indomitus-tech-tree/) · [Indomitus on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3494196322)

An unofficial bilingual research-tree companion for the **Indomitus** mod for **Call to Arms — Gates of Hell: Ostfront**. It turns the mod data into a searchable graph with unit composition, prerequisites, costs, armament, firing ranges, and a persistent research planner.

Current dataset: **2026.07.28.2** · Indomitus **v1.063** · **739** research nodes (**475** Imperial Guard, **264** Traitor Guard).

## Features

- complete research graphs for the Imperial Guard and Traitor Guard;
- search by research name, internal ID, or unit;
- branch, doctrine, and composition filters;
- research cost, complete prerequisite path, and remaining RP calculation;
- persistent learned/available/locked/target-path states stored in the browser;
- detailed squad and vehicle composition with game identifiers;
- primary armament and firing range, including per-ammunition ranges where available;
- vehicle-armament abbreviation guide;
- RU/EN interface, shareable links, keyboard navigation, and responsive layout;
- installable PWA with an offline application shell.

## Using the site

1. Choose **IG** or **TG**, then use search and filters to narrow the tree.
2. Select a research card to inspect its cost, full dependency path, unit composition, weapon, and direct unlocks.
3. Enable **Planning mode** and mark completed research. Progress is saved only in the current browser.
4. Drag empty tree space to pan. Use the mouse wheel or the zoom controls to scale the tree.
5. With the keyboard, use `Tab` to enter the tree, the arrow keys to move between cards, and `Enter` or `Space` to select one. `/` or `Ctrl/Cmd+F` focuses search; `+` and `-` change zoom; `Esc` closes a dialog or clears the selection.

Use the language and section controls in the header to switch between the research tree and the armament guide. The selected faction, research, language, and section are preserved in shareable URLs.

## Install and offline use

Use **Install app** on the site, or the browser's install/create-shortcut command. The service worker caches the application shell, data, icons, and research portraits. A previously loaded build remains usable offline; new mod data still requires publishing an updated build.

## Data sources and update process

The published tree is generated from supplied Indomitus game logic, entity definitions, and English/Russian localisation files, including `gamelogic.pak`, `entity.pak`, and the localisation archives. The scripts in [`scripts/`](scripts/) rebuild and audit planning data, research portraits, purchase costs, and weapon ranges.

Updates are **not automatic** when the Steam Workshop mod changes. A new mod release must be supplied, the generators rerun, audits reviewed, and the resulting site build published.

Coverage in the current weapon audit:

- 787 unique composition entries;
- a primary weapon identified for 752 entries;
- a numeric range identified for 738 entries;
- 33 entries have no primary weapon (mostly unarmed transport, supply assets, or role-only entities);
- 14 entries inherit or omit a numeric range in the supplied files;
- 2 referenced weapon configurations were not present in the supplied definitions.

When a numeric value or weapon configuration cannot be verified, the interface labels it as unavailable instead of inventing a value. See [`assets/weapon-ranges-audit.json`](assets/weapon-ranges-audit.json) for the audit trail.

## Local preview

No build step is required for the committed site:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Serving the files over HTTP is recommended because service workers do not run reliably from `file://` URLs.

## Contributing and feedback

Bug reports and corrections are welcome through [GitHub Issues](https://github.com/VRDProject/indomitus-tech-tree/issues). Please include the faction, research name or ID, expected value, and—when possible—the relevant mod version or source file. Pull requests should keep RU and EN content aligned and update the relevant audit when generated data changes.

## Disclaimer and license

This is an unofficial fan-made project. VRDProject is not the author of Indomitus and is not affiliated with the mod's development team. All rights to the mod, game, names, and source assets belong to their respective owners.

The repository's original code and documentation are released under the [MIT License](LICENSE). That license does not grant rights to third-party game or mod assets.

---

## Русский

[Открыть интерактивное древо](https://vrdproject.github.io/indomitus-tech-tree/?lang=ru) · [Мод Indomitus в Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3494196322)

Неофициальное двуязычное древо исследований для мода **Indomitus** к игре **Call to Arms — Gates of Hell: Ostfront**. Сайт преобразует данные мода в граф с поиском, составом отрядов, зависимостями, стоимостью, вооружением, дальностью стрельбы и сохраняемым планировщиком.

Текущие данные: **2026.07.28.2** · Indomitus **v1.063** · **739** исследований (**475** у Имперской гвардии и **264** у сил Хаоса).

### Возможности

- полные деревья исследований IG и TG;
- поиск по названию, внутреннему ID или юниту;
- фильтры по разделу, доктрине и наличию состава;
- стоимость исследования, полная цепочка требований и расчёт оставшихся RP;
- сохраняемые в браузере статусы изучения и пути к выбранной цели;
- подробный состав отрядов и техники с игровыми идентификаторами;
- основное вооружение и дальность, в том числе по типам боеприпасов;
- справочник сокращений вооружения и модификаций техники;
- интерфейс RU/EN, прямые ссылки, клавиатурная навигация и адаптивная верстка;
- устанавливаемое PWA с автономным режимом.

### Как пользоваться

1. Выберите **IG** или **TG**, затем используйте поиск и фильтры.
2. Нажмите на карточку, чтобы увидеть стоимость, полную цепочку требований, состав, вооружение и открываемые исследования.
3. Включите **Режим «Планирование»** и отмечайте изученные узлы. Прогресс хранится только в текущем браузере.
4. Перетаскивайте древо за пустое место. Масштаб меняется колесом мыши или кнопками.
5. С клавиатуры: `Tab` переводит фокус в древо, стрелки перемещают его между карточками, `Enter` или `Пробел` выбирают исследование. `/` или `Ctrl/Cmd+F` открывает поиск, `+` и `-` меняют масштаб, `Esc` закрывает окно или снимает выбор.

Выбранные язык, фракция, исследование и раздел сохраняются в ссылке.

### Установка, данные и обновления

Нажмите **Установить приложение** на сайте либо используйте команду установки/создания ярлыка в браузере. После первого открытия оболочка приложения, данные и портреты доступны без сети.

Древо сформировано из предоставленных файлов логики, сущностей и локализаций Indomitus, включая `gamelogic.pak`, `entity.pak` и архивы RU/EN. Оно **не обновляется автоматически** вслед за Steam Workshop: для новой версии необходимо получить файлы мода, повторно запустить генераторы и проверки, а затем опубликовать новую сборку.

В текущей проверке вооружение найдено для 752 из 787 уникальных элементов состава, а числовая дальность — для 738. Для 33 преимущественно невооружённых объектов основное оружие отсутствует; у 14 элементов дальность не задана числом; 2 конфигурации отсутствуют в предоставленных определениях. Интерфейс сообщает о пропуске явно. Подробности находятся в [`assets/weapon-ranges-audit.json`](assets/weapon-ranges-audit.json).

### Обратная связь

Ошибки и уточнения можно отправлять через [GitHub Issues](https://github.com/VRDProject/indomitus-tech-tree/issues). Укажите фракцию, название или ID исследования, ожидаемое значение и, если возможно, версию или исходный файл мода.

> **Дисклеймер:** это неофициальный фанатский проект. VRDProject не является автором Indomitus и не связан с командой разработчиков мода. Права на мод, игру, названия и исходные материалы принадлежат их правообладателям. Лицензия MIT распространяется только на оригинальный код и документацию этого репозитория и не предоставляет прав на сторонние материалы.
