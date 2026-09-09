import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Tabs from "@radix-ui/react-tabs";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Command,
  FileText,
  Globe,
  Keyboard,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Unplug,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Confirm, Dialog } from "./components/ui/dialog";
import { MonkeytypePage } from "./components/Monkeytype";
import { useApp, type Page } from "./store/app";
import { isDesktop, subscribe } from "./lib/bridge";
import {
  focusResult,
  loginResult,
  publicToEditable,
  selectResult,
  settingsSchema,
  stageLabels,
  type Config,
  type PreviewMessage,
  type SettingsValues,
} from "./lib/contracts";
import validateConfig from "./generated/config.js";

const nav: { page: Page; label: string; icon: typeof Activity }[] = [
  { page: "overview", label: "Обзор", icon: LayoutDashboard },
  { page: "studio", label: "Студия ввода", icon: Keyboard },
  { page: "telegram", label: "Telegram", icon: Send },
  { page: "monkeytype", label: "Monkeytype", icon: Globe },
  { page: "journal", label: "Журнал событий", icon: Activity },
];
const titles: Record<
  Page,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО",
    title: "Всё под контролем.",
    description: "Естественный ввод. Осознанная автоматизация.",
  },
  studio: {
    eyebrow: "ПОДГОТОВКА И ЗАПУСК",
    title: "Студия ввода",
    description: "Вы управляете текстом. TyperX берёт на себя печать.",
  },
  telegram: {
    eyebrow: "ПОДКЛЮЧЕНИЯ",
    title: "Ваш Telegram",
    description: "Личный чат или группа. В группе цель задаётся сообщением.",
  },
  monkeytype: {
    eyebrow: "ТРЕНАЖЁР",
    title: "Monkeytype",
    description: "Встроенное окно сайта. Войдите в аккаунт и нажмите F6.",
  },
  settings: {
    eyebrow: "ПАРАМЕТРЫ ДВИЖКА",
    title: "Точная настройка",
    description: "Ритм ввода, модель и характер ваших ответов.",
  },
  journal: {
    eyebrow: "ТЕКУЩАЯ СЕССИЯ",
    title: "Журнал событий",
    description: "Состояния движка — без текстов сообщений и секретов.",
  },
};
