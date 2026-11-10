"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WarehouseData } from "./orders-screen";
import "./orders.css";

type PackageOption = WarehouseData["packages"][number];

export function OpenPackagePicker({
  packages,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  page,
  total,
  hasMore,
  onPageChange,
  includeNew = false,
}: {
  packages: PackageOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  total: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  includeNew?: boolean;
}) {
  return (
    <fieldset className="orders-open-package-picker">
      <legend>Destino</legend>
      <label className="orders-open-package-search">
        <span className="sr-only">Buscar pacotes em montagem</span>
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar pacote em montagem"
          maxLength={200}
        />
      </label>
      <div className="orders-open-package-options" role="radiogroup" aria-label="Pacotes em montagem">
        {includeNew && (
          <label className="orders-open-package-option" data-selected={selectedId === ""}>
            <input
              type="radio"
              name="package-destination"
              value=""
              checked={selectedId === ""}
              onChange={() => onSelect("")}
            />
            <span className="orders-open-package-option-copy">
              <strong>Criar novo pacote</strong>
              <small>Montar um pacote separado</small>
            </span>
          </label>
        )}
        {packages.map((pkg) => (
          <label key={pkg.id} className="orders-open-package-option" data-selected={selectedId === pkg.id}>
            <input
              type="radio"
              name="package-destination"
              value={pkg.id}
              checked={selectedId === pkg.id}
              onChange={() => onSelect(pkg.id)}
              aria-label={`${pkg.name}, pacote em montagem`}
            />
            <span className="orders-open-package-option-copy">
              <strong>{pkg.name}</strong>
              <small>Em montagem</small>
            </span>
            <span className="orders-open-package-option-action" aria-hidden="true">
              {selectedId === pkg.id ? "Selecionado" : "Selecionar"}
            </span>
          </label>
        ))}
        {!packages.length && (
          <p className="orders-open-package-empty">
            {search.trim() ? "Nenhum pacote aberto corresponde à busca." : "Nenhum pacote aberto disponível nesta conta."}
          </p>
        )}
      </div>
      {total > 100 && (
        <nav className="orders-open-package-pages" aria-label="Páginas de pacotes em montagem">
          <Button type="button" variant="outline" disabled={!page} onClick={() => onPageChange(page - 1)}>
            Anterior
          </Button>
          <span>{page + 1} / {Math.ceil(total / 100)}</span>
          <Button type="button" variant="outline" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
            Mais pacotes
          </Button>
        </nav>
      )}
    </fieldset>
  );
}
