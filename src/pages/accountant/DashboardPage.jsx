import { useMemo, useState } from 'react'
import { fmtVnd } from '../../utils/format'

/**
 * Bảng điều khiển Kế toán.
 *
 * LƯU Ý: số liệu hiện đang RANDOM ở phía client, chỉ để dựng giao diện.
 * Khi nối API thật, thay `useRandomFigures()` bằng dữ liệu từ backend —
 * cấu trúc SECTIONS giữ nguyên, chỉ cần map `code` sang số dư tương ứng.
 */

// Mã tài khoản theo hệ thống TK Việt Nam (TT200) — giúp đối chiếu khi nối số liệu thật
const SECTIONS = [
  {
    title: 'Tiền và công nợ',
    subtitle: 'Số dư tại thời điểm hiện tại',
    cols: 'sm:grid-cols-2 xl:grid-cols-4',
    items: [
      { code: '111',  label: 'Tiền mặt',                icon: '💵', tone: 'emerald' },
      { code: '112',  label: 'Tiền gửi ngân hàng',      icon: '🏦', tone: 'blue' },
      { code: '131',  label: 'Phải thu khách hàng',     icon: '📥', tone: 'amber' },
      { code: '331',  label: 'Phải trả nhà cung cấp',   icon: '📤', tone: 'rose' },
    ],
  },
  {
    title: 'Hàng tồn kho và kết quả kinh doanh',
    subtitle: 'Lũy kế kỳ này',
    cols: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    items: [
      { code: '152',  label: 'Nguyên liệu',   icon: '🌾', tone: 'lime' },
      { code: '155',  label: 'Thành phẩm',    icon: '📦', tone: 'teal' },
      { code: '511',  label: 'Doanh thu',     icon: '📈', tone: 'blue' },
      { code: '3331', label: 'Thuế VAT',      icon: '🧾', tone: 'violet' },
      { code: '632',  label: 'Giá vốn',       icon: '⚖️', tone: 'orange' },
    ],
  },
  {
    title: 'Chi phí',
    subtitle: 'Lũy kế kỳ này',
    cols: 'sm:grid-cols-2 xl:grid-cols-4',
    items: [
      { code: '641',  label: 'Bán hàng',   icon: '🛒', tone: 'sky' },
      { code: '642',  label: 'Quản lý',    icon: '🏢', tone: 'indigo' },
      { code: '635',  label: 'Tài chính',  icon: '💳', tone: 'fuchsia' },
      { code: '811',  label: 'Khác',       icon: '📎', tone: 'slate' },
    ],
  },
]

// Tailwind không đọc được class ghép chuỗi động, nên map sẵn từng tone
const TONES = {
  emerald:  { chip: 'bg-emerald-50 text-emerald-600',  bar: 'bg-emerald-500' },
  blue:     { chip: 'bg-blue-50 text-blue-600',        bar: 'bg-blue-500' },
  amber:    { chip: 'bg-amber-50 text-amber-600',      bar: 'bg-amber-500' },
  rose:     { chip: 'bg-rose-50 text-rose-600',        bar: 'bg-rose-500' },
  lime:     { chip: 'bg-lime-50 text-lime-600',        bar: 'bg-lime-500' },
  teal:     { chip: 'bg-teal-50 text-teal-600',        bar: 'bg-teal-500' },
  violet:   { chip: 'bg-violet-50 text-violet-600',    bar: 'bg-violet-500' },
  orange:   { chip: 'bg-orange-50 text-orange-600',    bar: 'bg-orange-500' },
  sky:      { chip: 'bg-sky-50 text-sky-600',          bar: 'bg-sky-500' },
  indigo:   { chip: 'bg-indigo-50 text-indigo-600',    bar: 'bg-indigo-500' },
  fuchsia:  { chip: 'bg-fuchsia-50 text-fuchsia-600',  bar: 'bg-fuchsia-500' },
  slate:    { chip: 'bg-slate-100 text-slate-600',     bar: 'bg-slate-400' },
}

const randAmount = () => Math.round((Math.random() * 1.8e9 + 4e6) / 1000) * 1000
const randDelta  = () => +(Math.random() * 30 - 12).toFixed(1)

function Card({ item }) {
  const t = TONES[item.tone] || TONES.slate
  const up = item.delta >= 0

  return (
    <div className="card p-4 sm:p-5 hover:shadow-md transition-shadow relative overflow-hidden">
      <span className={`absolute left-0 top-0 h-full w-1 ${t.bar}`} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${t.chip}`}>
          {item.icon}
        </div>
        <span className="badge bg-gray-100 text-gray-400 font-mono">TK {item.code}</span>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{item.label}</p>
      <p className="mt-1.5 text-lg sm:text-xl font-bold text-gray-900 tabular-nums break-words">
        {fmtVnd(item.amount)}
      </p>

      <p className={`mt-2 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
        {up ? '▲' : '▼'} {Math.abs(item.delta)}% <span className="text-gray-400 font-normal">so với kỳ trước</span>
      </p>
    </div>
  )
}

export default function DashboardPage() {
  // Random một lần khi mount — không đổi số mỗi lần re-render
  const [seed] = useState(() => Date.now())
  const sections = useMemo(() => SECTIONS.map(s => ({
    ...s,
    items: s.items.map(i => ({ ...i, amount: randAmount(), delta: randDelta() })),
  })), [seed])

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Kế toán</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tổng quan số dư và kết quả kinh doanh
          <span className="ml-2 badge bg-amber-100 text-amber-700">Số liệu mẫu</span>
        </p>
      </div>

      <div className="space-y-7">
        {sections.map(section => (
          <section key={section.title}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{section.title}</h2>
              <span className="text-xs text-gray-400">{section.subtitle}</span>
            </div>
            <div className={`grid grid-cols-1 gap-3 sm:gap-4 ${section.cols}`}>
              {section.items.map(item => <Card key={item.code} item={item} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
