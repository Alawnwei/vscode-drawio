import {
	WebviewPanel,
	TextDocument,
	window,
	workspace,
	Uri,
	ThemeColor,
} from "vscode";
import { CustomDrawioInstance } from "./DrawioInstance";
import { DrawioDocument } from "./DrawioEditorProviderBinary";
import { EventEmitter } from "@hediet/std/events";
import { computed, observable, autorun, ObservableSet } from "mobx";

export class DrawioEditorManager {
	private readonly onEditorOpenedEmitter = new EventEmitter<{
		editor: DrawioEditor;
	}>();
	public readonly onEditorOpened = this.onEditorOpenedEmitter.asEvent();

	private readonly openedEditors = new ObservableSet<DrawioEditor>();

	@computed
	get activeDrawioEditor(): DrawioEditor | undefined {
		return [...this.openedEditors].find((e) => e.isActive);
	}

	@observable _lastActiveDrawioEditor: DrawioEditor | undefined;
	get lastActiveDrawioEditor(): DrawioEditor | undefined {
		return this._lastActiveDrawioEditor;
	}

	constructor() {
		autorun(() => {
			const a = this.activeDrawioEditor;
			if (a) {
				this._lastActiveDrawioEditor = a;
			}
		});
	}

	register(editor: DrawioEditor): void {
		this.openedEditors.add(editor);
		this.onEditorOpenedEmitter.emit({ editor });

		editor.webviewPanel.onDidDispose(() => {
			this.openedEditors.delete(editor);
		});
	}
}

export class DrawioEditor {
	@observable
	private _isActive = false;

	constructor(
		public readonly webviewPanel: WebviewPanel,
		public readonly instance: CustomDrawioInstance,
		public readonly document:
			| { kind: "text"; document: TextDocument }
			| { kind: "drawio"; document: DrawioDocument }
	) {
		this._isActive = webviewPanel.active;
		webviewPanel.onDidChangeViewState(() => {
			this._isActive = webviewPanel.active;
		});
	}

	public get isActive(): boolean {
		return this._isActive;
	}

	public get uri(): Uri {
		return this.document.document.uri;
	}

	/**
	 * @param newExtension Must start with a dot.
	 */
	public getUriWithExtension(newExtension: string): Uri {
		const baseName = this.uri.path.split(".")[0];

		return this.uri.with({
			path: baseName + newExtension,
		});
	}

	public async convertTo(targetExtension: string): Promise<void> {
		if (this.document.document.isDirty) {
			await window.showErrorMessage("Save your diagram first!");
			return;
		}
		const sourceUri = this.document.document.uri;
		const targetUri = this.getUriWithExtension(targetExtension);

		try {
			await workspace.fs.stat(targetUri);
			await window.showErrorMessage(
				`File "${targetUri.toString()}" already exists!`
			);
			return;
		} catch (e) {
			// file does not exist
		}

		const buffer = await this.instance.export(targetExtension);

		await workspace.fs.writeFile(sourceUri, buffer);
		await workspace.fs.rename(sourceUri, targetUri);
	}

	public async exportTo(targetExtension: string): Promise<void> {
		const buffer = await this.instance.export(targetExtension);
		const targetUri = await window.showSaveDialog({
			defaultUri: this.getUriWithExtension(targetExtension),
		});

		if (!targetUri) {
			return;
		}
		await workspace.fs.writeFile(targetUri, buffer);
	}
}
