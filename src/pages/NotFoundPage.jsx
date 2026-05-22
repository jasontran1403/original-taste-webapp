export default function NotFoundPage({ message, icon } = {}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-7xl mb-6">{icon || '🔍'}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {message ? message : 'Không tìm thấy trang'}
        </h1>
        <p className="text-gray-500 text-sm">
          {message ? '' : 'Địa chỉ này không tồn tại.'}
        </p>
      </div>
    </div>
  )
}
