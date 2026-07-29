import type { DocumentPickerAsset } from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';

export function appendDocumentAsset(data: FormData, field: string, asset: DocumentPickerAsset) {
  if (asset.file) {
    data.append(field, asset.file, asset.name);
    return;
  }

  const file = new ExpoFile(asset.uri);
  if (!file.exists) throw new Error('所选文件已失效，请重新选择');
  data.append(field, file, asset.name);
}

export function documentMultipartBody(asset: DocumentPickerAsset, field = 'file') {
  if (typeof FormData === 'undefined') throw new Error('当前设备不支持文件上传');
  const data = new FormData();
  appendDocumentAsset(data, field, asset);
  return data;
}
