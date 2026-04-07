import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Home, Compass, Bookmark, History, User, Settings, LogOut, Search } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const handleLogout = async () => {
    // We will hook this up to supabase.auth.signOut() later
    console.log("Logout clicked");
  };

  return (
    <div className="bg-zinc-100 min-h-screen w-full flex justify-center">
      {/* 390px Mobile Centered Container */}
      <div className="w-full max-w-[390px] bg-cream shadow-2xl relative min-h-screen flex flex-col overflow-hidden">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-cream border-b border-olive-pale px-4 py-3 flex items-center justify-between">
          <Sheet>
            <SheetTrigger asChild>
              <button title="Menu" className="p-1 -ml-1 text-espresso hover:text-olive-mid transition-colors">
                <Menu size={24} />
              </button>
            </SheetTrigger>
            
            {/* Drawer Overlay & Content */}
            <SheetContent side="left" className="w-[80%] max-w-[312px] p-0 bg-cream border-none shadow-2xl flex flex-col">
              
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {/* Logo Section */}
                <div className="p-6 bg-olive-pale/30 border-b border-olive-pale">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-olive text-white text-sm">
                      🍴
                    </span>
                    <span className="font-serif text-2xl text-espresso tracking-tight">Fork It</span>
                  </div>
                  
                  {/* User Profile Summary */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-olive-pale">
                      <AvatarImage src="" />
                      <AvatarFallback className="bg-olive-pale text-olive font-medium">GR</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-espresso font-semibold">Gordon Ramsay</span>
                      <span className="text-sm text-olive-mid">chef@forkit.app</span>
                    </div>
                  </div>
                </div>

                {/* Primary Nav Links */}
                <nav className="p-4 space-y-1">
                  <Link href="/home">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/home" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <Home size={20} />
                      Home
                    </span>
                  </Link>
                  <Link href="/explore">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/explore" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <Compass size={20} />
                      Explore
                    </span>
                  </Link>
                  <Link href="/saved">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/saved" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <Bookmark size={20} />
                      Saved Recipes
                    </span>
                  </Link>
                  <Link href="/history">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/history" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <History size={20} />
                      <div className="flex flex-col">
                        <span>History</span>
                        <span className="text-[10px] text-olive-mid font-normal">Last 20 days</span>
                      </div>
                    </span>
                  </Link>
                  <Link href="/profile">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/profile" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <User size={20} />
                      My Profile
                    </span>
                  </Link>
                  <Link href="/settings">
                    <span className={`flex items-center gap-3 px-3 py-2.5 rounded-md font-medium transition-colors ${location === "/settings" ? "bg-olive-pale text-olive" : "text-espresso hover:bg-olive-pale/50"}`}>
                      <Settings size={20} />
                      Settings
                    </span>
                  </Link>
                </nav>

                <Separator className="bg-olive-pale mx-4" />

                {/* History Preview Section */}
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-espresso mb-3 px-2">Recent Searches</h3>
                  <div className="relative mb-3 px-2">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-olive-mid" size={14} />
                    <Input 
                      placeholder="Search history..." 
                      className="pl-8 h-8 text-xs bg-white border-olive-pale focus-visible:ring-olive placeholder:text-olive-mid rounded-full"
                    />
                  </div>
                  
                  {/* Mocked recent cards */}
                  <div className="space-y-2 px-2">
                    <div className="flex items-center gap-2 p-2 rounded-md border border-olive-pale bg-white shadow-sm">
                      <div className="w-10 h-10 bg-olive-pale rounded shrink-0 flex items-center justify-center text-xs">🍝</div>
                      <div className="flex flex-col truncate">
                        <span className="text-sm font-medium text-espresso truncate">Garlic Butter Pasta</span>
                        <span className="text-[10px] text-olive-mid">Yesterday</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md border border-olive-pale bg-white shadow-sm">
                      <div className="w-10 h-10 bg-olive-pale rounded shrink-0 flex items-center justify-center text-xs">🌮</div>
                      <div className="flex flex-col truncate">
                        <span className="text-sm font-medium text-espresso truncate">Black Bean Tacos</span>
                        <span className="text-[10px] text-olive-mid">2 days ago</span>
                      </div>
                    </div>
                  </div>
                  
                  <Link href="/history">
                    <span className="block text-center text-xs text-olive font-medium mt-3 hover:text-espresso transition-colors">
                      View full history
                    </span>
                  </Link>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 mt-auto border-t border-olive-pale bg-white">
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={20} />
                  Log Out
                </button>
                <div className="text-center mt-4">
                  <span className="text-[9px] text-olive-mid uppercase tracking-widest font-semibold">Fork It v1.0</span>
                </div>
              </div>

            </SheetContent>
          </Sheet>

          {/* Center Logo */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 cursor-pointer">
            <span className="flex items-center justify-center w-6 h-6 rounded bg-olive text-white text-[12px] shadow-sm">
              🍴
            </span>
            <span className="font-serif text-xl tracking-tight text-espresso font-semibold">
              Fork It
            </span>
          </div>

          {/* Right Avatar */}
          <Link href="/profile">
            <Avatar className="h-8 w-8 cursor-pointer border border-olive-pale shadow-sm hover:ring-2 hover:ring-olive-pale transition-all">
              <AvatarImage src="" />
              <AvatarFallback className="bg-olive-pale text-olive text-xs font-semibold">GR</AvatarFallback>
            </Avatar>
          </Link>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar relative min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
