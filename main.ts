import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface ClickHintSettings {
    hintChars: string;
}

const DEFAULT_SETTINGS: ClickHintSettings = {
    hintChars: 'abcdefghijklmnopqrstuvwxyz',
};

export default class ClickHintPlugin extends Plugin {
    settings: ClickHintSettings;
    hintMode = false;
    hintElements: Record<string, HTMLElement> = {};

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new ClickHintSettingTab(this.app, this));
        this.addCommand({
            id: 'show-click-hints',
            name: 'Show click hints',
            hotkeys: [],
            callback: () => this.showHints(),
        });
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private showHints() {
        if (this.hintMode) return;
        this.hintMode = true;

        const clickableElements = Array.from(
            document.querySelectorAll(
                'a, button, [role="button"], [draggable="true"], [class$="item-self"], .clickable-icon, .is-clickable',
            ),
        );

        const hints = this.generateUniquePrefixes(clickableElements.length);
        const containerEl = document.querySelector('.app-container');
        if (!containerEl) return;
        clickableElements.forEach((element, index) => {
            const hint = hints[index];
            const marker = containerEl.createEl('div', { cls: 'click-hint-marker', text: hint });

            // Position the hint near the element
            const rect = (element as HTMLElement).getBoundingClientRect();
            marker.style.setProperty('--hint-left', `${rect.left}px`);
            marker.style.setProperty('--hint-top', `${rect.top}px`);

            document.body.appendChild(marker);
            this.hintElements[hint] = element as HTMLElement;
        });

        let currentInput = '';
        const keydownHandler = (evt: KeyboardEvent) => {
            if (!this.hintMode) return;

            evt.preventDefault();
            evt.stopPropagation();

            const key = evt.key.toLowerCase();
            if (key === 'escape') {
                this.removeHints();
                document.removeEventListener('keydown', keydownHandler, true);
                return;
            }

            currentInput += key;
            const hintCharacters = Object.entries(this.hintElements);
            const partialMatch = hintCharacters.filter(([hint]) => hint.startsWith(currentInput));

            if (!partialMatch.length) {
                this.removeHints();
                document.removeEventListener('keydown', keydownHandler, true);
                return;
            }

            const fullMatch = partialMatch.find(([hint]) => hint === currentInput);
            if (fullMatch) {
                this.removeHints();
                const targetElement = fullMatch[1];
                this.dispatchElementAction(targetElement);
                document.removeEventListener('keydown', keydownHandler, true);
                return;
            }

            // Update hint markers' appearance
            document.querySelectorAll('.click-hint-marker').forEach((marker: HTMLElement) => {
                const hintText = marker.textContent || '';
                if (hintText.startsWith(currentInput)) {
                    // emphasize the matched part
                    const matchedSpan = marker.createEl('span', { cls: 'click-hint-matched', text: currentInput });
                    marker.setText(hintText.slice(currentInput.length));
                    marker.insertBefore(matchedSpan, marker.firstChild);
                } else {
                    // remove unmatched marker
                    marker.remove();
                }
            });
        };

        document.addEventListener('keydown', keydownHandler, true);
    }

    // TODO support source mode
    private dispatchElementAction(element: HTMLElement) {
        // The anchor tag for internal links has the href set to #
        if (element.tagName === 'A' && element.parentElement?.className.contains('internal-link')) {
            const anchor = element as HTMLAnchorElement;
            const file = this.app.workspace.getActiveFile();
            if (file) {
                this.app.workspace.openLinkText(decodeURI(anchor.innerText), file.path, false, { active: true });
            }
            return;
        } else if (element.tagName === 'A') {
            // external link?
            const anchor = element as HTMLAnchorElement;
            window.open(anchor.innerText, '_blank');
        }
        element.click();
    }

    private removeHints() {
        this.hintMode = false;
        document.querySelectorAll('.click-hint-marker').forEach(el => el.remove());
        this.hintElements = {};
    }

    private generateUniquePrefixes(n: number): string[] {
        const letters = this.settings.hintChars.split('');

        if (n <= 0) {
            throw new Error('n must be a positive integer.');
        }

        // Maximum n we can handle with the given constraints
        const maxN = 26 + 25 * 26;
        if (n > maxN) {
            throw new Error('Cannot generate unique prefixes with the given n. Maximum allowed is 676.');
        }

        if (n <= 26) {
            return letters.slice(0, n);
        }

        const e = Math.ceil((n - 26) / 25);

        if (e > 26) {
            throw new Error('Cannot generate unique prefixes with the given n.');
        }

        const singleLetters = letters.slice(e);
        const prefixes = letters.slice(0, e);

        const longerStringsNeeded = n - (26 - e);
        const longerStrings: string[] = [];

        for (let i = 0; i < prefixes.length; i++) {
            for (let j = 0; j < letters.length; j++) {
                longerStrings.push(prefixes[i] + letters[j]);
                if (longerStrings.length === longerStringsNeeded) {
                    break;
                }
            }
            if (longerStrings.length === longerStringsNeeded) {
                break;
            }
        }

        return singleLetters.concat(longerStrings);
    }
}

class ClickHintSettingTab extends PluginSettingTab {
    plugin: ClickHintPlugin;

    constructor(app: App, plugin: ClickHintPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Hint characters')
            .setDesc('The characters to use as hints. Default: abcdefghijklmnopqrstuvwxyz')
            .addText(text =>
                text
                    .setPlaceholder('abcdefghijklmnopqrstuvwxyz')
                    .setValue(this.plugin.settings.hintChars)
                    .onChange(async value => {
                        this.plugin.settings.hintChars = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
