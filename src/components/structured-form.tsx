import { Plus, Trash2 } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AppSwitch } from "@/src/components/ui";
import { useAppTheme } from "@/src/lib/theme";
import type { ApiRecord } from "@/src/types/api";

const labels: Record<string, string> = {
  email: "邮箱",
  password: "密码",
  name: "名称",
  code: "验证码",
  invite_code: "邀请码",
  api_key: "API Key",
  role: "角色",
  disabled: "禁用",
  enabled: "启用",
  balance: "余额",
  currency: "币种",
  credit: "信用额度",
  amount: "金额",
  reason: "原因",
  prefix: "Key 前缀",
  secret: "Key 密钥",
  scopes: "权限范围",
  expires_at: "过期时间",
  created_at: "创建时间",
  updated_at: "更新时间",
  last_used_at: "最近使用",
  last_login_at: "最近登录",
  model: "模型",
  models: "模型列表",
  provider: "提供方",
  providers: "提供方列表",
  family: "协议族",
  modalities: "能力",
  hidden: "隐藏",
  free: "免费",
  prompt_price_per_1m: "输入价格 / 1M",
  completion_price_per_1m: "输出价格 / 1M",
  input_price_per_1m: "输入价格 / 1M",
  output_price_per_1m: "输出价格 / 1M",
  cache_read_per_1m: "缓存读价格 / 1M",
  cache_write_per_1m: "缓存写价格 / 1M",
  registry_hidden: "注册表隐藏",
  user_hidden: "用户隐藏",
  request_count: "请求数",
  total_tokens: "总 Token",
  prompt_tokens: "输入 Token",
  completion_tokens: "输出 Token",
  cache_read_tokens: "缓存读 Token",
  cache_write_tokens: "缓存写 Token",
  input_tokens: "输入 Token",
  output_tokens: "输出 Token",
  cost: "费用",
  price: "价格",
  limits: "限额配置",
  quota: "额度",
  status: "状态",
  status_code: "HTTP 状态码",
  status_reason: "状态原因",
  latency_ms: "延迟 (ms)",
  error: "错误信息",
  description: "描述",
  label: "标签",
  priority: "优先级",
  proxy_id: "代理 ID",
  scheme: "协议",
  host: "主机",
  port: "端口",
  username: "用户名",
  account_count: "关联账号数",
  base_url: "上游地址",
  route_prefix: "路由前缀",
  quota_query: "额度查询配置",
  max_redemptions: "最大使用次数",
  redemptions: "已使用次数",
  version: "当前版本",
  image_version: "镜像版本",
  latest_version: "最新版本",
  update_available: "有可用更新",
  app_env: "运行环境",
  database: "数据库",
  site_name: "站点名称",
  allow_open_registration: "开放注册",
  email_verification_enabled: "邮箱验证",
  require_invite_code: "需要邀请码",
  initialized: "已初始化",
  token: "Token",
  revoked_at: "撤销时间",
  bucket_start: "时间桶",
  count: "数量",
  total: "总数",
  page: "页码",
  page_size: "每页条数",
  limit: "条数",
  cursor: "分页游标",
  next_cursor: "下一页游标",
  q: "搜索关键词",
  from: "开始时间",
  to: "结束时间",
  range: "时间范围",
  purpose: "用途",
  messages: "消息",
  system: "系统提示",
  stream: "流式",
  temperature: "温度",
  max_tokens: "最大输出",
  tools: "工具",
  tool_choice: "工具选择",
  prompt: "提示词",
  size: "尺寸",
  response_format: "响应格式",
  usage: "用量",
  plan: "套餐",
  plans: "套餐列表",
  user: "用户",
  users: "用户列表",
  key: "Key",
  keys: "Key 列表",
  id: "ID",
};

function fieldLabel(key: string) {
  if (labels[key]) return labels[key];
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function FieldHeader({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 }}>
    <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" }}>{fieldLabel(name)}</Text>
    {onRemove ? <Pressable accessibilityLabel={`删除${fieldLabel(name)}`} onPress={onRemove} style={{ width: 28, height: 28, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Trash2 color={colors.danger} size={14} /></Pressable> : null}
  </View>;
}

const NumericField = memo(function NumericField({ name, value, onChange, onRemove }: { name: string; value: number; onChange: (value: number) => void; onRemove?: () => void }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) onChange(parsed);
    else setDraft(String(value));
    setFocused(false);
  }
  return <View style={{ gap: 6 }}>
    <FieldHeader name={name} onRemove={onRemove} />
    <TextInput
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onChangeText={(text) => {
        setDraft(text);
        if (/^-?\d+(?:\.\d+)?$/.test(text)) onChange(Number(text));
      }}
      keyboardType="numeric"
      autoCapitalize="none"
      autoCorrect={false}
      style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12 }}
    />
  </View>;
});

const PrimitiveField = memo(function PrimitiveField({
  name,
  value,
  onChange,
  onRemove,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onRemove?: () => void;
}) {
  const colors = useAppTheme();
  if (typeof value === "boolean") {
    return (
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" }}>
          {fieldLabel(name)}
        </Text>
        <AppSwitch
          accessibilityLabel={fieldLabel(name)}
          value={value}
          onValueChange={onChange}
        />
        {onRemove ? <Pressable accessibilityLabel={`删除${fieldLabel(name)}`} onPress={onRemove} style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" }}><Trash2 color={colors.danger} size={14} /></Pressable> : null}
      </View>
    );
  }
  if (typeof value === "number") return <NumericField name={name} value={value} onChange={onChange} onRemove={onRemove} />;
  const multiline = /content|prompt|template|message|system|description|config/i.test(name);
  return (
    <View style={{ gap: 6 }}>
      <FieldHeader name={name} onRemove={onRemove} />
      <TextInput
        value={value === null || value === undefined ? "" : String(value)}
        onChangeText={onChange}
        keyboardType="default"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: multiline ? 112 : 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
          fontFamily: multiline && /content|template|config/i.test(name) ? "monospace" : undefined,
          fontSize: 12,
        }}
      />
    </View>
  );
});

const AddField = memo(function AddField({ existingKeys, onAdd }: { existingKeys: string[]; onAdd: (key: string, value: unknown) => void }) {
  const colors = useAppTheme();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"text" | "number" | "switch" | "object" | "list">("text");
  const normalizedKey = key.trim();
  const duplicate = existingKeys.includes(normalizedKey);
  if (!open) return (
    <Pressable
      onPress={() => setOpen(true)}
      style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
    >
      <Plus color={colors.primary} size={15} />
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>添加字段</Text>
    </Pressable>
  );
  const options = [["text", "文本"], ["number", "数字"], ["switch", "开关"], ["object", "对象"], ["list", "列表"]] as const;
  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.rowBorder }}>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="字段名称"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 11 }}
      />
      {duplicate ? <Text style={{ color: colors.danger, fontSize: 11 }}>该字段已存在</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map(([value, label]) => <Pressable
          key={value}
          onPress={() => setKind(value)}
          style={{ paddingHorizontal: 10, height: 36, borderRadius: 10, borderWidth: 1, borderColor: kind === value ? colors.primary : colors.border, backgroundColor: kind === value ? colors.primarySoft : colors.card, alignItems: "center", justifyContent: "center" }}
        ><Text style={{ color: kind === value ? colors.primary : colors.text, fontSize: 11, fontWeight: "700" }}>{label}</Text></Pressable>)}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => { setOpen(false); setKey(""); }} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.subtext, fontWeight: "700" }}>取消</Text></Pressable>
        <Pressable
          disabled={!normalizedKey || duplicate}
          onPress={() => {
            const initial = kind === "number" ? 0 : kind === "switch" ? false : kind === "object" ? {} : kind === "list" ? [] : "";
            onAdd(normalizedKey, initial);
            setOpen(false);
            setKey("");
          }}
          style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: normalizedKey && !duplicate ? colors.primary : colors.disabled, alignItems: "center", justifyContent: "center" }}
        ><Text style={{ color: "#fff", fontWeight: "800" }}>添加</Text></Pressable>
      </View>
    </View>
  );
});

function ArrayField({ name, value, onChange, depth, onRemove }: { name: string; value: unknown[]; onChange: (value: unknown[]) => void; depth: number; onRemove?: () => void }) {
  const colors = useAppTheme();
  const nextKeyRef = useRef(0);
  const itemKeysRef = useRef<string[]>([]);
  while (itemKeysRef.current.length < value.length) {
    itemKeysRef.current.push(`${name}-${nextKeyRef.current++}`);
  }
  if (itemKeysRef.current.length > value.length) {
    itemKeysRef.current.length = value.length;
  }
  const updateItem = (index: number, next: unknown) => {
    onChange(value.map((entry, itemIndex) => itemIndex === index ? next : entry));
  };
  const removeItem = (index: number) => {
    itemKeysRef.current = itemKeysRef.current.filter((_, itemIndex) => itemIndex !== index);
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };
  const appendItem = (item: unknown) => {
    itemKeysRef.current.push(`${name}-${nextKeyRef.current++}`);
    onChange([...value, item]);
  };
  return (
    <View style={{ gap: 9 }}>
      <FieldHeader name={name} onRemove={onRemove} />
      {value.map((item, index) => (
        <View key={itemKeysRef.current[index]} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            {isRecord(item) ? <RecordFields value={item} onChange={(next) => updateItem(index, next)} depth={depth + 1} />
              : Array.isArray(item) ? <ArrayField name={`第 ${index + 1} 项`} value={item} onChange={(next) => updateItem(index, next)} depth={depth + 1} />
                : <PrimitiveField name={`第 ${index + 1} 项`} value={item} onChange={(next) => updateItem(index, next)} />}
          </View>
          <Pressable accessibilityLabel="删除列表项" onPress={() => removeItem(index)} style={{ width: 38, height: 38, marginTop: isRecord(item) || Array.isArray(item) ? 0 : 30, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerBg }}>
            <Trash2 color={colors.danger} size={15} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([['文本', ''], ['数字', 0], ['开关', false], ['对象', {}], ['列表', []]] as const).map(([label, initial]) => <Pressable key={label} onPress={() => appendItem(Array.isArray(initial) ? [] : isRecord(initial) ? {} : initial)} style={{ flexGrow: 1, flexBasis: 92, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{label}项</Text></Pressable>)}
      </View>
    </View>
  );
}

function RecordFields({ value, onChange, depth = 0 }: { value: ApiRecord; onChange: (value: ApiRecord) => void; depth?: number }) {
  const colors = useAppTheme();
  const removeField = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  return (
    <View style={{ gap: 12, padding: depth ? 12 : 0, borderWidth: depth ? 1 : 0, borderColor: colors.border, borderRadius: 14 }}>
      {Object.entries(value).map(([key, item]) => (
        <View key={key} style={{ gap: 7 }}>
          {isRecord(item) ? <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: "800" }}>{fieldLabel(key)}</Text>
              <Pressable accessibilityLabel={`删除${fieldLabel(key)}`} onPress={() => removeField(key)}><Trash2 color={colors.danger} size={14} /></Pressable>
            </View>
            <RecordFields value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth + 1} />
          </> : Array.isArray(item) ? <ArrayField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth} onRemove={() => removeField(key)} />
            : <PrimitiveField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} onRemove={() => removeField(key)} />}
        </View>
      ))}
      <AddField existingKeys={Object.keys(value)} onAdd={(key, item) => onChange({ ...value, [key]: item })} />
    </View>
  );
}

export function StructuredForm({ value, onChange }: { value: ApiRecord; onChange: (value: ApiRecord) => void }) {
  return <RecordFields value={value} onChange={onChange} />;
}

export function StructuredDataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const colors = useAppTheme();
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([key]) => !["ret", "msg"].includes(key));
    if (!entries.length) return <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无数据</Text>;
    return <View style={{ gap: 9 }}>
      {entries.slice(0, 200).map(([key, item]) => <View key={key} style={{ gap: 5, paddingLeft: depth ? 10 : 0, borderLeftWidth: depth ? 1 : 0, borderLeftColor: colors.border }}>
        <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>{fieldLabel(key)}</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
      {entries.length > 200 ? <Text style={{ color: colors.subtext, fontSize: 11, textAlign: "center" }}>仅显示前 200 个字段，共 {entries.length} 个</Text> : null}
    </View>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无项目</Text>;
    return <View style={{ gap: 8 }}>
      {value.slice(0, 200).map((item, index) => <View key={index} style={{ gap: 5, padding: 10, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>第 {index + 1} 项</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
      {value.length > 200 ? <Text style={{ color: colors.subtext, fontSize: 11, textAlign: "center" }}>仅显示前 200 项，共 {value.length} 项</Text> : null}
    </View>;
  }
  const text = typeof value === "boolean" ? (value ? "是" : "否") : value === null || value === undefined || value === "" ? "--" : String(value);
  return <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{text}</Text>;
}
