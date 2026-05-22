export const fmtCurrency = v =>
  v == null ? '—' : new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(v)

export const fmtDateTime = ms => {
  if (!ms) return '—'
  return new Intl.DateTimeFormat('vi-VN',{
    timeZone:'Asia/Ho_Chi_Minh',
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit'
  }).format(new Date(ms))
}

export const todayVN = () => {
  const d = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh'}))
  return d.toISOString().slice(0,10)
}

export const within12h = createdAtMs => {
  if (!createdAtMs) return false
  const nowVN = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh'}))
  return (nowVN - new Date(createdAtMs)) < 12*3600*1000
}
