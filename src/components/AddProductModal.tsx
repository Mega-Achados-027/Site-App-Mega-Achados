import React, {useState} from 'react';
import {Bell, MessageCircle, Plus, X} from 'lucide-react';
import type {StoreConfig} from '../types.ts';

interface AddProductModalProps {
  stores: StoreConfig[];
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    category: string;
    brand: string;
    basePrice: number;
    targetMinPrice: number;
    targetMaxPrice: number;
    minDiscountPercent: number;
    trackedStoreIds: string[];
    notifyWhatsApp: boolean;
    notifyPush: boolean;
  }) => Promise<void>;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  stores,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Eletrônicos');
  const [brand, setBrand] = useState('');
  const [basePrice, setBasePrice] = useState('2500');
  const [targetMinPrice, setTargetMinPrice] = useState('1750');
  const [targetMaxPrice, setTargetMaxPrice] = useState('2200');
  const [minDiscountPercent, setMinDiscountPercent] = useState('10');
  const [selectedStores, setSelectedStores] = useState<string[]>(
    stores.filter((s) => s.active).map((s) => s.id),
  );
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const toggleStore = (storeId: string) => {
    setSelectedStores((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedStores.length === 0) return;
    setSubmitting(true);
    try {
      const parsedMax = Math.max(10, Number(targetMaxPrice) || 2000);
      const parsedMin = Math.max(
        1,
        Math.min(parsedMax - 1, Number(targetMinPrice) || Math.round(parsedMax * 0.7)),
      );
      const parsedBase = Math.max(parsedMax, Number(basePrice) || Math.round(parsedMax * 1.12));

      await onCreate({
        name: name.trim(),
        category: category.trim() || 'Eletrônicos',
        brand: brand.trim() || name.trim().split(' ')[0] || 'Geral',
        basePrice: parsedBase,
        targetMinPrice: parsedMin,
        targetMaxPrice: parsedMax,
        minDiscountPercent: Math.max(1, Number(minDiscountPercent) || 10),
        trackedStoreIds: selectedStores,
        notifyWhatsApp,
        notifyPush,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#13141A] border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
              Monitorar Novo Produto
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Defina a faixa de preço alvo e quais lojas o Mega Achados 027 deve acompanhar em tempo real.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Nome do Produto ou Modelo *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: MacBook Air M3 16GB 256GB"
              className="w-full min-h-[42px] px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              >
                <option value="Hardware">Hardware</option>
                <option value="Smartphones">Smartphones</option>
                <option value="Áudio">Áudio</option>
                <option value="TV & Casa">TV & Casa</option>
                <option value="Monitores">Monitores</option>
                <option value="Games">Games</option>
                <option value="Eletroportáteis">Eletroportáteis</option>
                <option value="Eletrônicos">Eletrônicos</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Marca
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Apple, Samsung, LG"
                className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Preço Atual (R$)
              </label>
              <input
                type="number"
                min={10}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Faixa Mín. (R$)
              </label>
              <input
                type="number"
                min={1}
                value={targetMinPrice}
                onChange={(e) => setTargetMinPrice(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Alvo Máx. (R$)
              </label>
              <input
                type="number"
                min={10}
                value={targetMaxPrice}
                onChange={(e) => setTargetMaxPrice(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Desc. Mín. (%)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={minDiscountPercent}
                onChange={(e) => setMinDiscountPercent(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-[#0B0C10] text-sm font-mono-num text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600 dark:focus:ring-yellow-400"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Lojas monitoradas simultaneamente ({selectedStores.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stores.map((store) => {
                const checked = selectedStores.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => toggleStore(store.id)}
                    className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium text-left transition-colors truncate ${
                      checked
                        ? 'border-yellow-400 bg-amber-50 dark:bg-yellow-400/10 text-amber-800 dark:text-yellow-400'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {store.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={notifyWhatsApp}
                onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
              />
              <MessageCircle className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Avisar no WhatsApp</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={notifyPush}
                onChange={(e) => setNotifyPush(e.target.checked)}
                className="rounded border-zinc-300 text-red-600 focus:ring-red-600"
              />
              <Bell className="w-4 h-4 text-amber-600 dark:text-yellow-400" />
              <span>Notificação Push em Tempo Real</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || selectedStores.length === 0}
              className="min-h-[42px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Salvando...' : 'Iniciar Monitoramento'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
