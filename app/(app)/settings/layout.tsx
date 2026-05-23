// Settings layout — sub-navigation now lives in the Sidebar "설정" section.
// Subnav was removed in Wave 2; this is a simple passthrough wrapper.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {children}
    </div>
  );
}
