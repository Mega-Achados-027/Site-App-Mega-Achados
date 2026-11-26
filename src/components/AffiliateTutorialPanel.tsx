import React, {useState} from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type {StoreConfig} from '../types.ts';
import {extractAffiliateInfoFromUrl, isShortAffiliateUrl} from '../utils/affiliate.ts';
import type {DetectedAffiliateInfo} from '../utils/affiliate.ts';

interface AffiliateTutorialPanelProps {
  stores: StoreConfig[];
  onApplyDetected: (storeId: string, patch: Partial<StoreConfig>) => Promise<void>;
}

interface StoreGuide {
  id: string;
  label: string;
  portal: string;
  modeLabel: string;
  paramLabel: string;
  exampleTag: string;
  exampleUrl: string;
  steps: string[];
  tip: string;
}

const STORE_GUIDES: StoreGuide[] = [
  {
    id: 'amazon',
    label: 'Amazon BR',
    portal: 'associados.amazon.com.br',
    modeLabel: 'Parâmetro na URL',
    paramLabel: 'tag',
    exampleTag: 'megaachados027-20',
    exampleUrl: 'https://www.amazon.com.br/dp/B0CS12345?tag=megaachados027-20',
    steps: [
      'Entre na Central de Associados Amazon (associados.amazon.com.br) com sua conta aprovada.',
      'No canto superior direito, clique em "ID da Loja" ou "Gerenciar seus IDs de Rastreamento".',
      'Copie o código que termina com "-20" (exemplo: megaachados027-20).',
      'No cartão da Amazon abaixo, mantenha o modo "Parâmetro na URL", parâmetro "tag" e cole seu código em "Seu ID / Tag de Afiliado".',
    ],
    tip: 'Você também encontra sua tag gerando um link pelo SiteStripe no topo da Amazon e copiando o valor que aparece após "tag=".',
  },
  {
    id: 'mercadolivre',
    label: 'Mercado Livre',
    portal: 'mercadolivre.com.br/afiliados',
    modeLabel: 'Parâmetro na URL',
    paramLabel: 'matt_word + matt_tool + forceInApp',
    exampleTag: 'matt_word=mh20241004134402&matt_tool=88747486&forceInApp=true',
    exampleUrl:
      'https://www.mercadolivre.com.br/p/MLB18917848?matt_word=mh20241004134402&matt_tool=88747486&forceInApp=true',
    steps: [
      'Acesse a Central de Afiliados e Criadores do Mercado Livre e abra o "Gerador de links".',
      'Gere um link de qualquer produto — pode copiar tanto o link curto (https://meli.la/...) quanto o link completo (/social/...?matt_word=...&matt_tool=...).',
      'Cole esse link no Extrator Automático ao lado: o sistema expande o meli.la sozinho e extrai sua etiqueta (matt_word), seu matt_tool e forceInApp=true.',
      'Clique em "Aplicar Tag em Mercado Livre" para atualizar todos os alertas e ofertas do site imediatamente.',
    ],
    tip: 'Você pode colar links curtos https://meli.la/... direto no Extrator Automático ao lado — nós expandimos automaticamente para capturar matt_word, matt_tool e forceInApp=true.',
  },
  {
    id: 'shopee',
    label: 'Shopee BR',
    portal: 'affiliate.shopee.com.br',
    modeLabel: 'Parâmetro na URL',
    paramLabel: 'af_siteid',
    exampleTag: '18392040027',
    exampleUrl: 'https://shopee.com.br/product/123/456?af_siteid=18392040027',
    steps: [
      'Faça login no Programa de Afiliados Shopee (affiliate.shopee.com.br).',
      'Clique no seu perfil no canto superior direito e copie o número de "Affiliate ID" (geralmente 11 dígitos).',
      'Ou gere um link em "Link Personalizado", abra no navegador e copie o número que aparece depois de "af_siteid=" ou "utm_source=".',
      'Cole esse número em "Seu ID / Tag de Afiliado" no cartão da Shopee abaixo.',
    ],
    tip: 'Para links de sub-ID personalizados da Shopee, você também pode usar o modo Template Personalizado com sub_id.',
  },
  {
    id: 'magalu',
    label: 'Magazine Luiza',
    portal: 'parceiromagalu.com.br',
    modeLabel: 'Loja Parceira / Prefixo',
    paramLabel: 'magazinevoce.com.br/{id}/{path}',
    exampleTag: 'megaachados027',
    exampleUrl: 'https://www.magazinevoce.com.br/megaachados027/p/234567800/',
    steps: [
      'Acesse o painel do Parceiro Magalu (parceiromagalu.com.br).',
      'Observe o endereço da sua vitrine: https://www.magazinevoce.com.br/NOME_DA_SUA_LOJA.',
      'Copie somente o nome da sua loja (tudo que vem logo após "magazinevoce.com.br/", sem barras).',
      'No cartão da Magazine Luiza, deixe o modo "Loja Parceira / Prefixo" e cole o nome da sua loja em "Seu ID / Tag".',
    ],
    tip: 'Assim todo produto encontrado no site oficial magazineluiza.com.br é convertido automaticamente para a sua vitrine magazinevoce.com.br.',
  },
  {
    id: 'kabum',
    label: 'KaBuM! / Awin',
    portal: 'ui.awin.com',
    modeLabel: 'Template Personalizado',
    paramLabel: 'awinaffid',
    exampleTag: '847291',
    exampleUrl: 'https://www.awin1.com/cread.php?awinmid=17729&awinaffid=847291&ued=https%3A%2F%2Fwww.kabum.com.br%2Fproduto%2F123',
    steps: [
      'A KaBuM! opera seu programa de afiliados pela rede Awin (ui.awin.com).',
      'Após entrar na Awin, copie o seu "Publisher ID" (número exibido abaixo do nome da sua conta no menu superior).',
      'Certifique-se de estar aprovado no anunciante KaBuM! (ID de programa awinmid=17729).',
      'No cartão da KaBuM!, selecione "Template Personalizado", cole seu Publisher ID e mantenha o template Awin com {id} e {url}.',
    ],
    tip: 'O mesmo formato de Template Awin funciona para qualquer loja da rede Awin (basta trocar o número de awinmid no template).',
  },
  {
    id: 'casasbahia',
    label: 'Casas Bahia / Outras',
    portal: 'Redes Awin, Rakuten ou Lomadee',
    modeLabel: 'Parâmetro ou Template',
    paramLabel: 'utm_source / ref',
    exampleTag: 'megaachados027',
    exampleUrl: 'https://www.casasbahia.com.br/produto-x/p/550123?utm_source=megaachados027',
    steps: [
      'Para Casas Bahia, AliExpress, Terabyte, Pichau ou Fast Shop, gere um link de teste no seu painel de afiliado.',
      'Observe se o link adiciona um parâmetro no final (como "?ref=SEUID" ou "?utm_source=SEUID") ou se usa um domínio redirecionador (Awin, Lomadee, Admitad).',
      'Se usar parâmetro no final, escolha "Parâmetro na URL". Se usar redirecionador, escolha "Template Personalizado" com {url} onde entra o link do produto.',
      'Teste colando qualquer URL de produto no campo "Prévia do link gerado" para conferir antes de salvar.',
    ],
    tip: 'Dúvida sobre qual parâmetro usar? Cole seu link de afiliado já gerado no Extrator Automático ao lado.',
  },
];

export const AffiliateTutorialPanel: React.FC<AffiliateTutorialPanelProps> = ({
  stores,
  onApplyDetected,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeGuideId, setActiveGuideId] = useState<string>('amazon');
  const [pasteUrl, setPasteUrl] = useState('');
  const [detected, setDetected] = useState<DetectedAffiliateInfo | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [expandingShortUrl, setExpandingShortUrl] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  const activeGuide = STORE_GUIDES.find((g) => g.id === activeGuideId) || STORE_GUIDES[0];

  const handleAnalyzeUrl = async (value: string) => {
    setPasteUrl(value);
    setAppliedMsg(null);
    if (!value.trim()) {
      setDetected(null);
      setExtractError(null);
      setExpandingShortUrl(false);
      return;
    }

    const directResult = extractAffiliateInfoFromUrl(value);
    if (directResult) {
      setDetected(directResult);
      setExtractError(null);
      setExpandingShortUrl(false);
      return;
    }

    if (isShortAffiliateUrl(value)) {
      setExpandingShortUrl(true);
      setExtractError(null);
      setDetected(null);
      try {
        const res = await fetch('/api/affiliate/expand-url', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url: value.trim()}),
        });
        if (res.ok) {
          const data = (await res.json()) as {expandedUrl?: string};
          if (data.expandedUrl) {
            const expandedResult = extractAffiliateInfoFromUrl(data.expandedUrl);
            if (expandedResult) {
              setDetected(expandedResult);
              setExtractError(null);
              return;
            }
          }
        }
        setExtractError(
          'Não conseguimos ler os parâmetros dentro desse link encurtado. Abra o link no navegador, copie o endereço completo da barra e cole aqui.',
        );
      } catch {
        setExtractError(
          'Erro ao expandir link encurtado. Abra o link no navegador e cole a URL completa aqui.',
        );
      } finally {
        setExpandingShortUrl(false);
      }
      return;
    }

    setDetected(null);
    setExpandingShortUrl(false);
    setExtractError(
      'Não identificamos uma tag de afiliado nessa URL. Cole um link encurtado (ex: https://meli.la/...) ou a URL completa contendo ?tag=, matt_word=, matt_tool=, af_siteid=, awinaffid= ou magazinevoce.com.br/sualoja.',
    );
  };

  const handleApplyDetected = async () => {
    if (!detected) return;
    const matchedStore =
      stores.find((s) => s.id === detected.storeId) ||
      stores.find((s) =>
        detected.storeName.toLowerCase().includes(s.domain.split('.')[0].toLowerCase()),
      );

    if (!matchedStore) {
      setExtractError(
        `Tag "${detected.affiliateTag}" encontrada, mas a loja "${detected.storeName}" ainda não está cadastrada. Use "Adicionar Nova Loja" com parâmetro "${detected.affiliateParam}" e ID "${detected.affiliateTag}".`,
      );
      return;
    }

    setApplying(true);
    try {
      await onApplyDetected(matchedStore.id, {
        affiliateMode: detected.affiliateMode,
        affiliateParam: detected.affiliateParam,
        affiliateTag: detected.affiliateTag,
        ...(detected.affiliateTemplate ? {affiliateTemplate: detected.affiliateTemplate} : {}),
      });
      setAppliedMsg(
        `Pronto! Tag "${detected.affiliateTag}" aplicada automaticamente em ${matchedStore.name}.`,
      );
      setPasteUrl('');
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-5 sm:px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0">
          <BookOpen className="w-5 h-5 text-amber-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              Mini Tutorial: Como Achar sua Tag e Configurar a Conversão de Links
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Passo a passo rápido por loja + extrator automático (cole qualquer link seu de afiliado para extrair a tag na hora).
            </p>
          </div>
        </div>
        <span className="min-h-[34px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span>{isOpen ? 'Ocultar guia' : 'Abrir tutorial'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {isOpen && (
        <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-5">
          {/* Store Tutorial Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-[#0B0C10]">
            {STORE_GUIDES.map((guide) => {
              const active = guide.id === activeGuideId;
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => setActiveGuideId(guide.id)}
                  className={`min-h-[34px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-zinc-950 dark:bg-yellow-400 text-white dark:text-zinc-950 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                  }`}
                >
                  {guide.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Step-by-Step Guide */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {activeGuide.label}
                </span>
                <span aria-hidden="true">·</span>
                <span>Portal: {activeGuide.portal}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 dark:text-yellow-400 font-medium">
                  Modo: {activeGuide.modeLabel}
                </span>
              </div>

              <ol className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {activeGuide.steps.map((step, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <span className="font-mono-num font-bold text-red-600 dark:text-yellow-400 shrink-0 w-5">
                      0{index + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Exemplo de URL convertida ({activeGuide.paramLabel}):
                </p>
                <div className="px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-amber-700 dark:text-yellow-400 break-all">
                  {activeGuide.exampleUrl}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                  <strong className="text-zinc-800 dark:text-zinc-200">Dica:</strong> {activeGuide.tip}
                </p>
              </div>
            </div>

            {/* Automatic Affiliate URL Tag Extractor */}
            <div className="lg:col-span-5 rounded-xl bg-zinc-50 dark:bg-[#0B0C10] border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col justify-between gap-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-red-600 dark:text-yellow-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
                    Extrator Automático de Tag
                  </h3>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Já tem um link de afiliado gerado? Cole aqui embaixo que o{' '}
                  <strong className="text-zinc-900 dark:text-white">Mega Achados 027</strong> lê a URL, identifica sua tag automaticamente e preenche a loja para você.
                </p>

                <input
                  type="text"
                  value={pasteUrl}
                  onChange={(e) => void handleAnalyzeUrl(e.target.value)}
                  placeholder="Cole seu link (ex: https://meli.la/... ou https://amazon.com.br/dp/...?tag=sua-tag-20)"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#13141A] text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
                />

                {expandingShortUrl && (
                  <p className="text-xs text-amber-700 dark:text-yellow-400">
                    Expandindo link encurtado para extrair sua tag...
                  </p>
                )}

                {detected && (
                  <div className="p-3 rounded-xl bg-white dark:bg-[#13141A] border border-amber-300 dark:border-yellow-500/40 space-y-2">
                    <p className="text-xs font-semibold text-zinc-950 dark:text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                      {detected.storeName} detectada
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                      {detected.explanation}
                    </p>
                    <div className="text-[11px] font-mono text-amber-700 dark:text-yellow-400">
                      Parâmetro: {detected.affiliateParam} · Tag: {detected.affiliateTag}
                    </div>
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => void handleApplyDetected()}
                      className="w-full min-h-[38px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                    >
                      {applying
                        ? 'Aplicando...'
                        : `Aplicar Tag em ${detected.storeName}`}
                    </button>
                  </div>
                )}

                {extractError && (
                  <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                    {extractError}
                  </p>
                )}

                {appliedMsg && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-yellow-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{appliedMsg}</span>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleAnalyzeUrl(activeGuide.exampleUrl)}
                className="text-left text-[11px] font-medium text-red-600 dark:text-yellow-400 hover:underline"
              >
                Testar extrator com exemplo de {activeGuide.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
