"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { costRequest } from "@/components/packages/package-cost-client";
import type {
  listLogisticsPackages,
  packageListQuerySchema,
} from "@/lib/domain/logistics-package-list";
import type { z } from "zod";
type PackageList = Awaited<ReturnType<typeof listLogisticsPackages>>;
type PackageFilter = z.infer<typeof packageListQuerySchema>["filter"];
import "./orders.css";

const emptyCopy: Record<PackageFilter, { title: string; description: string }> = {
  content_closed: {
    title: "Nenhum pacote com conteúdo fechado",
    description:
      "Este filtro mostra apenas pacotes fechados. Pacotes em montagem aparecem em outra etapa.",
  },
  preparing: {
    title: "Nenhum pacote em montagem",
    description:
      "Selecione unidades disponíveis em Pedidos para iniciar uma montagem.",
  },
  sent: {
    title: "Nenhum pacote enviado nesta etapa",
    description:
      "Os pacotes de outras etapas continuam disponíveis nos filtros correspondentes.",
  },
  received: {
    title: "Nenhum pacote recebido nesta etapa",
    description:
      "Os pacotes de outras etapas continuam disponíveis nos filtros correspondentes.",
  },
  review: {
    title: "Nenhum pacote aguardando conferência",
    description:
      "Pacotes já conferidos aparecem em outra etapa.",
  },
  closed: {
    title: "Nenhum pacote com custos encerrados",
    description:
      "O encerramento financeiro é apresentado neste filtro quando estiver registrado.",
  },
};

export function LogisticsPackagesScreen() {
  const [data, setData] = useState<PackageList | null>(null);
  const [error, setError] = useState("");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [filter, setFilter] = useState<PackageFilter>("content_closed");
  const [page, setPage] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const query = `filter=${filter}&page=${page}`;
  const requestKey = `${query}:${retryKey}`;
  const loading = loadedQuery !== requestKey;

  useEffect(() => {
    let active = true;
    void costRequest<PackageList>(`/api/logistics/packages?${query}`)
      .then((result) => {
        if (!active) return;
        if (result.ok && result.data) {
          setData(result.data);
          setError("");
        }
        else setError(result.error ?? "Não foi possível carregar os pacotes.");
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os pacotes.");
      })
      .finally(() => {
        if (active) setLoadedQuery(requestKey);
      });
    return () => {
      active = false;
    };
  }, [query, requestKey]);

  const rows = data?.rows ?? [];
  const empty = emptyCopy[filter];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Pacotes</h1>
          <p className="muted">Conteúdo, envio e encargos de cada pacote.</p>
        </div>
        <Link href="/orders">Montar a partir dos pedidos</Link>
      </div>
      <div className="orders-filters orders-package-filters">
        <label>
          Etapa
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as PackageFilter);
              setPage(0);
            }}
          >
            <option value="content_closed">Fechados</option>
            <option value="preparing">Em montagem</option>
            <option value="sent">Enviados</option>
            <option value="received">Recebidos</option>
            <option value="review">Conferência legada pendente</option>
            <option value="closed">Encerrados financeiramente</option>
          </select>
        </label>
      </div>
      {!loading && error && (
        <div className="orders-request-error">
          <p role="alert" className="form-error">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError("");
              setRetryKey((current) => current + 1);
            }}
          >
            Tentar carregar novamente
          </Button>
        </div>
      )}
      {loading && <p role="status">Carregando pacotes…</p>}
      {!loading && !error && data && !rows.length && (
        <div className="orders-empty">
          <h2>{empty.title}</h2>
          <p>{empty.description}</p>
          <div className="orders-empty-actions">
            {filter !== "preparing" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilter("preparing");
                  setPage(0);
                }}
              >
                Ver pacotes em montagem
              </Button>
            )}
            <Link href="/orders">Selecionar unidades em Pedidos</Link>
          </div>
        </div>
      )}
      <div className="orders-list" aria-busy={loading}>
        {!loading && !error && rows.map(({ pkg, unitCount, freightConfirmed }) => (
          <article key={pkg.id} className="orders-row">
            <div className="orders-row-main">
              <Link className="orders-name" href={`/packages/detail/${encodeURIComponent(pkg.id)}`}>
                {pkg.name}
              </Link>
              <p>
                {unitCount} unidades · {pkg.reviewState === "pending_review" ? "Conferência legada pendente" : pkg.contentClosedAt ? "Conteúdo fechado" : "Conteúdo em montagem"}
              </p>
              <p className="muted">
                {freightConfirmed ? "Frete pago" : "Frete a conferir"}{pkg.weightGrams ? ` · ${pkg.weightGrams} g` : ""}
              </p>
            </div>
            <Link href={`/packages/detail/${encodeURIComponent(pkg.id)}`}>Abrir pacote</Link>
          </article>
        ))}
      </div>
      {!loading && !error && (data?.pagination.total ?? 0) > 20 && (
        <nav className="orders-pagination" aria-label="Páginas de pacotes">
          <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span>{page + 1} / {Math.ceil((data?.pagination.total ?? 0) / 20)}</span>
          <Button variant="outline" disabled={!data?.pagination.hasMore} onClick={() => setPage(page + 1)}>Próxima</Button>
        </nav>
      )}
    </>
  );
}
