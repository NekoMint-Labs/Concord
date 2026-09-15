import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DTO } from "../api/client";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui/button";

export function SemanticRetrieval({
  project,
  enabled,
  perform,
  onRun,
}: {
  project: string;
  enabled: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
  onRun: (id: string) => void;
}) {
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState(false);
  const [matches, setMatches] = useState<DTO<"SemanticMatch">[]>([]);
  const [searched, setSearched] = useState(false);
  const searchVersion = useRef(0);
  function changeSelection() {
    searchVersion.current += 1;
    setConsent(false);
    setMatches([]);
    setSearched(false);
  }
  async function search() {
    const version = ++searchVersion.current;
    const found = await api.semanticSearch(project, query, documentId, consent);
    if (version === searchVersion.current) {
      setMatches(found);
      setSearched(true);
    }
  }
  const documentId = selected || documents.data?.[0]?.id || "";
  return (
    <details className="operation-form">
      <summary>派生向量检索 / PostgreSQL</summary>
      <p>
        结构化与本地文本检索仍为默认方式。仅索引所选文档（最多 128
        个分块）。测试令牌向量已明确标注，且并非语言模型。
      </p>
      <AppSelect
        label="待索引文档"
        value={documentId}
        onChange={(next) => {
          changeSelection();
          setSelected(next);
        }}
        options={(documents.data ?? []).map((doc) => ({
          value: doc.id,
          label: doc.filename,
        }))}
      />
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        若使用真实云端向量提供方，我同意发送所选的最小化文本与我的查询。
      </label>
      <Button
        variant="secondary"
        disabled={!enabled || !documentId}
        onClick={() =>
          void perform(async () => {
            const run = await api.indexDocument(project, documentId, consent);
            onRun(run.id);
          })
        }
      >
        索引所选文档
      </Button>
      <div className="semantic-query">
        <input
          aria-label="语义查询"
          value={query}
          onChange={(event) => {
            changeSelection();
            setQuery(event.target.value);
          }}
          placeholder="查找相关文档证据"
        />
        <Button
          disabled={!enabled || !query.trim()}
          onClick={() => void perform(search)}
        >
          搜索向量
        </Button>
      </div>
      {!enabled && (
        <small>
          需要服务端扩展、带 pgvector 的
          PostgreSQL、CCA_VECTOR_ENABLED，以及可选的向量迁移。
        </small>
      )}
      {searched && matches.length === 0 && (
        <p>没有匹配的已索引证据。请确认所选来源 / 模型修订的索引已完成。</p>
      )}
      {matches.map((match) => (
        <article className="document-chunk" key={match.chunk_id}>
          <strong>
            {match.test_only ? "仅测试向量" : "语义匹配"} / 得分{" "}
            {match.score.toFixed(3)}
          </strong>
          <p>{match.text}</p>
          <small>
            第 {match.page ?? "?"} 页 / {match.model}@{match.model_version} /
            SHA {match.source_hash.slice(0, 12)}
          </small>
        </article>
      ))}
    </details>
  );
}
