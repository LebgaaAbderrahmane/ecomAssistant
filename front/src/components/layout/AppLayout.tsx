import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar.js'
import { Topbar } from './Topbar.js'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <Topbar />
      <main className="ml-[250px] pt-14 px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
