/**
 * Render smoke test for the DEV-CP-02 preview pages.
 *
 * Renders the pages to static markup in Node. It cannot verify layout at real
 * mobile widths (no browser in the sandbox), but it proves both pages mount,
 * produce expected content and do not crash before any user interaction.
 */
import assert from "node:assert/strict";
import React from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Router, Route, Switch } from "wouter";
import TariffProfilesPage from "@/pages/TariffProfilesPage";
import TariffEditorPage from "@/pages/TariffEditorPage";

/**
 * Static location hook: the memory hook from wouter needs a client store, which
 * does not exist during server rendering.
 */
function staticHook(state: { path: string }) {
  return () => [state.path, () => undefined] as [string, (to: string) => void];
}

function render(path: string, routePath: string, Page: React.ComponentType): string {
  return renderToStaticMarkup(
    <Router hook={staticHook({ path })}>
      <Switch>
        <Route path={routePath} component={Page} />
      </Switch>
    </Router>,
  );
}

describe("preview pages render", () => {
  it("renders the profiles page with the protected template", () => {
    const html = render("/tariffs", "/tariffs", TariffProfilesPage);
    assert.match(html, /Профили тарифов/);
    assert.match(html, /Salamat Mebel/);
    assert.match(html, /шаблон/);
    assert.match(html, /Новый профиль/);
    assert.match(html, /Импорт JSON/);
    assert.match(html, /data-testid="copy-template"/);
  });

  it("renders the editor for the template in read-only mode", () => {
    const html = render("/tariffs/salamat-mebel", "/tariffs/:profileId", TariffEditorPage);
    assert.match(html, /Шаблон Salamat Mebel/);
    assert.match(html, /только чтение/);
    assert.match(html, /неизменяемый шаблон/);
    assert.match(html, /Создать копию и редактировать/);
    assert.match(html, /Проверить тариф/);
    // The template editor never offers a save button.
    assert.doesNotMatch(html, /data-testid="save-profile"/);
  });

  it("shows unconfirmed positions as «Цена не задана» instead of zero", () => {
    const html = render("/tariffs/salamat-mebel", "/tariffs/:profileId", TariffEditorPage);
    assert.match(html, /Цена не задана/);
    assert.doesNotMatch(html, /· 0 ₸/);
    const placeholders = html.match(/Цена не задана/g) ?? [];
    assert.ok(placeholders.length >= 7, `expected at least 7 unconfirmed positions, got ${placeholders.length}`);
  });

  it("renders a clear message for an unknown profile", () => {
    const html = render("/tariffs/unknown-profile", "/tariffs/:profileId", TariffEditorPage);
    assert.match(html, /Профиль не найден/);
  });
});
