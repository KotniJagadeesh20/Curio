import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, Menu, X, Sun, Moon, User, Settings, LogOut, LayoutDashboard, PenSquare } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/context/AuthContext";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navLinks = [
  { name: "Home", path: "/" },
  { name: "Discover", path: "/discover" },
  { name: "Tracks", path: "/tracks" },
  { name: "Practice", path: "/practice" },
  { name: "System Design", path: "/system-design" },
  { name: "Dashboard", path: "/dashboard" },
  { name: "Blog", path: "/blog" },
];

/** Any logged-in user can write; this is a UX shortcut only (the backend decides who may do what). */
const writeLink = { name: "Write", path: "/create" };

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const links = user ? [...navLinks, writeLink] : navLinks;

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate("/login");
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <nav className="glass-card mx-4 mt-4 rounded-2xl">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.3 }}
                className="p-2 rounded-xl gradient-bg"
              >
                <Code2 className="h-5 w-5 text-primary-foreground" />
              </motion.div>
              <span className="text-xl font-bold gradient-text">AlgoQuest</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {links.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className="relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.name}
                  {(location.pathname === link.path || (link.path === "/create" && location.pathname.startsWith("/create/"))) && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute inset-0 rounded-lg bg-muted"
                      style={{ zIndex: -1 }}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              ))}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <AnimatePresence mode="wait">
                  {theme === "dark" ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Sun className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Moon className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="hidden md:flex">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-label="Account menu"
                      className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-bold text-white"
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </motion.button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border z-50">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/create" className="cursor-pointer">
                        <PenSquare className="h-4 w-4 mr-2" />
                        My Collections
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer">
                        <User className="h-4 w-4 mr-2" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer">
                          <Settings className="h-4 w-4 mr-2" />
                          Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Link to="/login" className="hidden md:block">
                    <Button variant="ghost" size="sm">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup" className="hidden md:block">
                    <Button size="sm" className="gradient-bg text-primary-foreground">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}

              {/* Mobile Menu Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
              >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </motion.button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden glass-card mx-4 mt-2 rounded-2xl overflow-hidden"
          >
            <div className="p-4 space-y-2">
              {links.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`block px-4 py-3 rounded-lg transition-colors ${
                    location.pathname === link.path
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-2 border-t border-border space-y-2">
                {user ? (
                  <>
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setIsOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start">Admin</Button>
                      </Link>
                    )}
                    <Link to="/profile" onClick={() => setIsOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">Profile</Button>
                    </Link>
                    <Button variant="ghost" className="w-full justify-start text-destructive" onClick={handleLogout}>
                      Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setIsOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        Login
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setIsOpen(false)}>
                      <Button className="w-full gradient-bg text-primary-foreground">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
