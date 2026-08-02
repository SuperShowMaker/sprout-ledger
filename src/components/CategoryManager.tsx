// 青禾记账 - 分类管理
import { useEffect, useState } from 'react';
import { Modal, Button, Input, List, message, Space, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons';
import {
  getCategories,
  addCategory1,
  addCategory2,
  deleteCategory1,
  deleteCategory2,
  renameCategory1,
  renameCategory2,
  countExpensesByCategory,
} from '../db';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import { defaultCat1Names, defaultCat2Names } from '../data/categories';
import { useBackBlock } from '../useBackBlock';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const EMOJI_LIST = ['🍜', '🚗', '🛒', '🏠', '💊', '📚', '🎮', '🎁', '📱', '📦', '💻', '👶', '🐱', '🌿', '🎵', '✈️', '☕', '💡'];

export default function CategoryManager({ open, onClose, onChanged }: Props) {
  const { t, lang } = useI18n();
  const [categories, setCategories] = useState<{ name: string; icon: string; children: string[] }[]>([]);
  const [newCat1, setNewCat1] = useState('');
  const [newCat1Icon, setNewCat1Icon] = useState('📦');
  const [newCat2Parent, setNewCat2Parent] = useState('');
  const [newCat2Name, setNewCat2Name] = useState('');
  const [editingCat1, setEditingCat1] = useState('');
  const [editingCat1NewName, setEditingCat1NewName] = useState('');
  const [editingCat2, setEditingCat2] = useState<{ name: string; parent: string } | null>(null);
  const [editingCat2NewName, setEditingCat2NewName] = useState('');

  const isDefaultCat1 = (name: string) => defaultCat1Names.includes(name);
  const isDefaultCat2 = (name: string) => defaultCat2Names.includes(name);

  interface ConfirmAction {
    title: string;
    content: string;
    okText: string;
    onOk: () => Promise<void>;
  }
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const load = async () => {
    const cats = await getCategories();
    setCategories(cats);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  useBackBlock(open, onClose);

  const handleAddCat1 = async () => {
    if (!newCat1.trim()) return;
    if (categories.find((c) => c.name === newCat1.trim())) {
      message.warning(t('cat.nameExists'));
      return;
    }
    await addCategory1(newCat1.trim(), newCat1Icon);
    message.success(t('cat.added'));
    setNewCat1('');
    setNewCat1Icon('📦');
    await load();
    onChanged();
  };

  const handleAddCat2 = async () => {
    if (!newCat2Parent || !newCat2Name.trim()) return;
    const parent = categories.find((c) => c.name === newCat2Parent);
    if (parent?.children.find((c) => c === newCat2Name.trim())) {
      message.warning(t('cat.subExists'));
      return;
    }
    await addCategory2(newCat2Name.trim(), newCat2Parent);
    message.success(t('cat.added'));
    setNewCat2Name('');
    setNewCat2Parent('');
    await load();
    onChanged();
  };

  const handleDeleteCat1 = async (name: string) => {
    const count = await countExpensesByCategory(name);
    if (count > 0) {
      setConfirm({
        title: t('cat.deleteTitle'),
        content: t('cat.deleteContent', { count }),
        okText: t('cat.keepDelete'),
        onOk: async () => {
          await deleteCategory1(name);
          message.success(t('cat.deletedWithRecords'));
          await load();
          onChanged();
        },
      });
    } else {
      setConfirm({
        title: t('cat.deleteSimpleTitle'),
        content: t('cat.deleteSimpleContent'),
        okText: t('cat.delete'),
        onOk: async () => {
          await deleteCategory1(name);
          message.success(t('cat.deleted'));
          await load();
          onChanged();
        },
      });
    }
  };

  const handleDeleteCat2 = async (name: string, parent: string) => {
    try {
      const count = await countExpensesByCategory(parent, name);
      if (count > 0) {
        setConfirm({
          title: t('cat.deleteTitle'),
          content: t('cat.deleteSubContent', { count }),
          okText: t('cat.keepDelete'),
          onOk: async () => {
            await deleteCategory2(name, parent);
            message.success(t('cat.deletedWithRecords'));
            await load();
            onChanged();
          },
        });
      } else {
        setConfirm({
          title: t('cat.deleteSimpleTitle'),
          content: t('cat.deleteSimpleContent'),
          okText: t('cat.keepDelete'),
          onOk: async () => {
            await deleteCategory2(name, parent);
            message.success(t('cat.deleted'));
            await load();
            onChanged();
          },
        });
      }
    } catch (err) {
      message.error(`${lang === 'zh' ? '删除失败' : 'Delete failed'}: ${String(err)}`);
    }
  };

  const handleRenameCat1 = async () => {
    if (!editingCat1NewName.trim() || editingCat1NewName.trim() === editingCat1) {
      setEditingCat1('');
      return;
    }
    if (categories.find((c) => c.name === editingCat1NewName.trim())) {
      message.warning(t('cat.nameExists'));
      return;
    }
    await renameCategory1(editingCat1, editingCat1NewName.trim());
    message.success(t('cat.renamed'));
    setEditingCat1('');
    await load();
    onChanged();
  };

  const handleRenameCat2 = async () => {
    if (!editingCat2 || !editingCat2NewName.trim() || editingCat2NewName.trim() === editingCat2.name) {
      setEditingCat2(null);
      return;
    }
    const parent = categories.find((c) => c.name === editingCat2.parent);
    if (parent?.children.find((c) => c === editingCat2NewName.trim())) {
      message.warning(t('cat.subExists'));
      return;
    }
    await renameCategory2(editingCat2.name, editingCat2NewName.trim(), editingCat2.parent);
    message.success(t('cat.renamed'));
    setEditingCat2(null);
    await load();
    onChanged();
  };

  const cat1Items = categories.map((cat) => ({
    key: cat.name,
    label: (
      <span>
        {cat.icon} {translateCategory(lang, cat.name)}
        <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>
          ({t('cat.childrenCount', { n: cat.children.length })})
        </span>
      </span>
    ),
    styles: { body: { padding: '2px 8px 6px' } },
    children: (
      <div>
        {/* 一级分类操作 */}
        {editingCat1 === cat.name ? (
          <Space style={{ marginBottom: 12 }}>
            <Input
              size="small"
              value={editingCat1NewName}
              onChange={(e) => setEditingCat1NewName(e.target.value)}
              onPressEnter={handleRenameCat1}
              style={{ width: 120 }}
            />
            <Button size="small" type="primary" onClick={handleRenameCat1}>{t('cat.ok')}</Button>
            <Button size="small" onClick={() => setEditingCat1('')}>{t('list.cancel')}</Button>
          </Space>
        ) : (
          <Space style={{ marginBottom: 12 }}>
            {!isDefaultCat1(cat.name) && (
              <>
                <Button size="small" icon={<EditOutlined />}
                  onClick={() => { setEditingCat1(cat.name); setEditingCat1NewName(cat.name); }}>
                  {t('cat.rename')}
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteCat1(cat.name)}>
                  {t('cat.delete')}
                </Button>
              </>
            )}
          </Space>
        )}

        {/* 二级分类列表 */}
        <List
          size="small"
          dataSource={cat.children}
          renderItem={(child: string) => {
            const isEditing = editingCat2?.name === child && editingCat2?.parent === cat.name;
            return (
            <List.Item
              actions={
                isEditing ? undefined : (
                  !isDefaultCat2(child) ? [
                    <Space size="small" key="actions">
                      <Button size="small" type="text" icon={<EditOutlined />}
                        onClick={() => {
                          setEditingCat2({ name: child, parent: cat.name });
                          setEditingCat2NewName(child);
                        }}
                      />
                      <Button size="small" type="text" danger icon={<DeleteOutlined />}
                        onClick={() => handleDeleteCat2(child, cat.name)} />
                    </Space>
                  ] : undefined
                )
              }
            >
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <Input
                    size="small"
                    value={editingCat2NewName}
                    onChange={(e) => setEditingCat2NewName(e.target.value)}
                    onPressEnter={handleRenameCat2}
                    style={{ flex: 1, minWidth: 0 }}
                    autoFocus
                  />
                  <Button size="small" type="primary" onClick={handleRenameCat2}>{t('cat.ok')}</Button>
                  <Button size="small" onClick={() => setEditingCat2(null)}>{t('list.cancel')}</Button>
                </div>
              ) : (
                translateCategory(lang, child)
              )}
            </List.Item>
          )}}
        />

        {/* 添加小类 */}
        {newCat2Parent === cat.name && (
          <Space style={{ marginTop: 8 }}>
            <Input
              size="small"
              placeholder={t('cat.cat2Placeholder')}
              value={newCat2Name}
              onChange={(e) => setNewCat2Name(e.target.value)}
              onPressEnter={handleAddCat2}
              style={{ width: 120 }}
            />
            <Button size="small" type="primary" onClick={handleAddCat2}>{t('cat.ok')}</Button>
            <Button size="small" onClick={() => { setNewCat2Parent(''); setNewCat2Name(''); }}>{t('list.cancel')}</Button>
          </Space>
        )}
        {newCat2Parent !== cat.name && (
          <Button size="small" type="dashed" icon={<PlusOutlined />} block
            onClick={() => setNewCat2Parent(cat.name)}
            style={{ marginTop: 8 }}>
            {t('cat.addCat2')}
          </Button>
        )}
      </div>
    ),
  }));

  return (
    <>
    <Modal
      title={<span><SettingOutlined /> {t('cat.title')}</span>}
      open={open}
      onCancel={onClose}
      width="min(520px, calc(100vw - 24px))"
      footer={null}
      maskClosable={false}
      centered
    >
      {/* 添加一级分类 */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ lineHeight: '32px', fontWeight: 600 }}>{t('cat.selectIcon')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {EMOJI_LIST.map((emoji) => (
            <span
              key={emoji}
              onClick={() => setNewCat1Icon(emoji)}
              style={{
                fontSize: 20,
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: 4,
                background: newCat1Icon === emoji ? 'rgba(82,196,26,0.15)' : 'transparent',
                border: newCat1Icon === emoji ? '2px solid #52c41a' : '2px solid transparent',
              }}
            >
              {emoji}
            </span>
          ))}
        </div>
        <Space.Compact style={{ width: '100%', marginTop: 8 }}>
          <Input
            placeholder={t('cat.cat1Placeholder')}
            value={newCat1}
            onChange={(e) => setNewCat1(e.target.value)}
            onPressEnter={handleAddCat1}
            prefix={newCat1Icon}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddCat1}>{t('cat.addCat1')}</Button>
        </Space.Compact>
      </div>

      {/* 现有分类 */}
      <Collapse items={cat1Items} className="cat-collapse" styles={{ body: { padding: '4px 8px' } }} />
    </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        title={null}
        open={!!confirm}
        centered
        onOk={async () => {
          if (confirm) { await confirm.onOk(); setConfirm(null); }
        }}
        onCancel={() => setConfirm(null)}
        okText={confirm?.okText}
        okButtonProps={{ danger: true, style: { borderRadius: 20 } }}
        cancelText={t('list.cancel')}
        cancelButtonProps={{ style: { borderRadius: 20 } }}
      >
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#fff1f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 22,
          }}><DeleteOutlined /></div>
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#333' }}>
            {confirm?.title}
          </p>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            {confirm?.content}
          </p>
        </div>
      </Modal>
    </>
  );
}
