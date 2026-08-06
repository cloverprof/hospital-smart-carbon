# 3ds Max 2025 + V-Ray 6.2 夜景场景高清渲染教程

适用场景：

- 3ds Max 2025
- V-Ray 6.20.06
- 原始场景来自 3ds Max 2014 + V-Ray Adv 2.40.04
- 场景文件：`D:\GPT项目医院\项目提示文件\claude_prompt\夜景\夜景.max`

目标：保留原相机、建筑、灯光、树木和道路，输出适合网页大屏使用的 4K/5K 夜景图。

> 本教程只处理场景兼容、资源链接和渲染，不涉及软件授权或认证修改。

## 一、不要覆盖原始文件

已经准备好的工作副本：

```text
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\夜景_3dsMax2025_工作副本.max
```

请打开工作副本，不要继续编辑 `夜景.max`。

如果 3ds Max 当前打开的是 `夜景.max`：

1. 点击 `File / 文件`。
2. 选择 `Save As / 另存为`。
3. 保存为 `夜景_3dsMax2025_工作副本.max`。
4. 后续所有修改都在工作副本中进行。

旧版文件保存为 2025 格式后，通常无法再由 2014 打开，因此一定保留原件。

## 二、首次打开时怎样选择

旧场景第一次载入可能需要数分钟。树木使用了大量 V-Ray Proxy，窗口短暂无响应并不等于崩溃。

如果出现以下提示：

### 1. 文件版本较旧

选择继续打开。不要直接覆盖保存。

### 2. 单位不一致（System Unit Scale Mismatch）

优先选择：

```text
Adopt the File's Unit Scale / 采用文件的单位比例
```

这样可以避免楼宇、灯光衰减距离和树木代理尺寸发生变化。

### 3. Gamma 或 Color Management 提示

优先保留场景原设置：

```text
Use Scene Settings / 使用场景设置
```

不要在第一轮测试前强制转换到新的 OCIO 工作流。旧 V-Ray 2.4 场景通常按 Gamma 2.2 制作，立即转换可能导致曝光和贴图颜色改变。

### 4. Missing External Files

先选择继续打开。后面统一重新链接，不要逐个点选文件。

### 5. Missing DLLs / 缺少插件

先截图或记录插件名称，再继续打开。

- 与 V-Ray 相关的旧材质通常能被 V-Ray 6 读取。
- `.vrmesh` 树木由 V-Ray 6 支持。
- 如果缺少 Forest Pack、MultiScatter、RailClone 等第三方插件，相应对象可能无法显示，需要单独处理。
- 不要看到缺失插件就立即保存场景，先检查建筑和树木是否完整。

## 三、重新链接贴图、树木和光照缓存

原场景记录的是制作人员旧电脑上的绝对路径。当前资源已经按原目录结构整理到“夜景”文件夹中。

### 方法 A：添加 External Files 搜索路径

在 3ds Max 中打开：

```text
Customize / 自定义
→ Configure User Paths / 配置用户路径
→ External Files / 外部文件
→ Add / 添加
```

依次添加下面目录，并在文件夹选择窗口中勾选或确认 `Add Subpaths / 添加子路径`：

```text
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\Users\Administrator\Desktop\夜景_OK
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\Users\Administrator\Desktop
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\WORK
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\vic 材质
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\模型
```

添加后保存设置，关闭并重新打开工作副本，让 3ds Max 重新搜索资源。

### 方法 B：Asset Tracking 批量设置路径

按下：

```text
Shift + T
```

打开 `Asset Tracking / 资源追踪`。

重点检查状态为 `Missing / 缺失` 的：

- JPG、PNG、TGA、TIF、BMP 贴图
- `.vrmesh` 树木代理
- `夜景.vrmap` 光照缓存

旧路径与新路径对应关系如下：

| 原始路径前缀 | 当前目录 |
|---|---|
| `C:\Users\Administrator\Desktop\夜景_OK` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\Users\Administrator\Desktop\夜景_OK` |
| `C:\Users\Administrator\Desktop\夜景.vrmap` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\Users\Administrator\Desktop\夜景.vrmap` |
| `E:\WORK\MAPS` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\WORK\MAPS` |
| `E:\WORK\夜景` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\WORK\夜景` |
| `E:\WORK\WANG` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\WORK\WANG` |
| `E:\vic 材质\D店铺` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\vic 材质\D店铺` |
| `E:\模型\整理小品` | `D:\GPT项目医院\项目提示文件\claude_prompt\夜景\模型\整理小品` |

在 Asset Tracking 中选中同一旧目录下的文件，右键选择 `Set Path / 设置路径`，指向对应的新目录。

完成标准：Asset Tracking 中不再存在关键资源的 `Missing` 状态。少量找不到的装饰贴图可以后续判断，但 `.vrmesh` 树木不能缺失。

## 四、确认 V-Ray 已经成为生产渲染器

按 `F10` 打开 `Render Setup / 渲染设置`。

在 `Common / 公用` 或 `Assign Renderer / 指定渲染器` 中确认：

```text
Production Renderer = V-Ray 6
```

如果显示 Arnold 或 Scanline：

1. 点击 Production 右侧按钮。
2. 选择 V-Ray。
3. 等待旧 V-Ray 设置载入完成。

建议第一轮使用：

```text
Engine = V-Ray CPU
```

原因是旧场景的材质、贴图和代理在 CPU 渲染器下兼容性通常更完整。不要一开始就改为 V-Ray GPU。

## 五、找到并锁定原相机

不要重新摆相机，否则很难复现现有网页夜景角度。

### 查看场景相机

1. 激活一个视口。
2. 按键盘 `C`。
3. 如果弹出相机列表，逐个选择场景已有相机。
4. 找到与当前网页背景一致的鸟瞰夜景角度。
5. 按 `Shift + F` 显示 Safe Frames，确认最终画面边界。

也可以在 `Scene Explorer / 场景资源管理器` 中筛选 `Camera` 查看所有相机。

找到正确相机后：

- 不要使用鼠标滚轮、Orbit 或 Pan 修改相机视图。
- 可以开启视口的 `Lock Camera to View` 保护选项。
- 建议记下相机名称。

## 六、先检查场景完整度

在正式渲染前，检查：

- 所有主要楼宇是否存在。
- 建筑窗户和外墙是否有材质，而不是纯灰色。
- 道路、停车场、广场和停机坪是否存在。
- 树木是否显示为完整模型，而不是边界框或全部缺失。
- 夜景灯光是否存在。
- 背景或环境贴图是否正常。

如果视口为了性能把 V-Ray Proxy 显示为 Box，这不代表渲染时缺失。可以选中代理，在其显示设置中临时改为 Preview Faces 检查一两棵树，不要把全部树都改成完整视口显示。

## 七、第一张低分辨率测试图

不要直接渲染 5K。先在 `F10 → Common → Output Size` 设置：

```text
Width  = 1280
Height = 720
```

当前网页背景的原始比例约为 16:9，因此 1280×720、1920×1080、3840×2160 和 5120×2880都不会改变构图比例。

测试设置建议：

```text
Image Sampler = Progressive
Noise Threshold = 0.03
Time Limit = 5–10 分钟
```

测试阶段只判断：

- 相机角度正确与否。
- 灯光是否正常。
- 树木是否完整。
- 是否出现粉红、黑色或纯灰色缺失材质。
- 是否存在曝光严重偏亮或偏暗。

使用 `Shift + Q` 或点击 Render 开始测试渲染。

## 八、夜景曝光与色彩

优先保留旧场景原有灯光和相机曝光，不要第一步就添加太阳、天空或新灯光。

如果整体过暗：

1. 先检查 V-Ray Frame Buffer 中是否启用了错误的 Exposure 图层。
2. 检查相机是否为 Physical Camera，以及 ISO、快门和光圈。
3. 每次只调整一项并重新测试。

推荐夜景起点（仅在原相机曝光明显错误时参考）：

```text
ISO：400–800
Shutter Speed：1/30–1/60
F-number：5.6–8
White Balance：偏冷或 Neutral
```

这些不是必须照抄的固定值。旧场景可能通过灯光强度和 Color Mapping 完成曝光，优先保留原值。

如果网页需要深蓝夜景：

- 保持建筑外部为深蓝灰色。
- 室内窗光和路灯保持暖色。
- 不要把阴影压成纯黑，面板覆盖区域仍应保留少量细节。
- 避免过强 Bloom/Glare，否则大屏上会显得发糊。

## 九、推荐的最终 V-Ray 设置

确认测试图正常后，切换到最终设置。

### 1. 图像采样

```text
Image Sampler = Bucket
Noise Threshold = 0.01
Max Subdivs = 24（如果界面提供该项）
```

如果时间充足、要求更干净，可把 Noise Threshold 调到 `0.005`，但渲染时间可能明显增加。

### 2. 全局光照 GI

推荐重新计算，不强制依赖 2020 年的旧缓存：

```text
GI = On
Primary Engine = Brute Force
Secondary Engine = Light Cache
Light Cache Subdivs = 1500–2000
```

原场景中的 `夜景.vrmap` 可以作为还原旧效果的备选，但新旧 V-Ray 跨度较大，第一次正式输出建议使用 Brute Force + Light Cache 重新计算。

### 3. 降噪

在 `Render Elements / 渲染元素` 中添加：

```text
VRayDenoiser
```

建议：

```text
Preset = Mild
Amount = 0.5–0.7
```

不要使用过强降噪，否则树叶、窗格和道路细节会被抹平。

### 4. Bloom 与 Glare

可以在 V-Ray Frame Buffer 中少量添加：

- Bloom 强度保持低。
- Glare 保持低。
- 只让窗灯和路灯产生轻微光晕。

大屏背景最怕大面积雾化，不建议追求夸张电影光晕。

## 十、最终输出尺寸

推荐分阶段输出：

### 草稿确认

```text
1920 × 1080
```

### 推荐高清母版

```text
5120 × 2880
```

### 最高质量归档

```text
7680 × 4320
```

建议先完成 5120×2880。8K 对内存和渲染时间要求很高，且网页实际通常只需要 4K。

## 十一、输出文件格式

不要把最终渲染直接保存为低质量 JPG。

推荐母版：

```text
PNG 16-bit
```

或者：

```text
OpenEXR 16-bit Half Float
```

建议输出目录：

```text
D:\GPT项目医院\项目提示文件\claude_prompt\夜景\render_output
```

文件命名示例：

```text
hospital-night-campus_5120x2880_master.png
hospital-night-campus_7680x4320_master.exr
```

渲染完成后，再从母版导出网页版本：

```text
3840 × 2160 WebP
质量 90–95
```

不要把母版删除，后续色彩调整应始终从 PNG/EXR 母版重新导出。

## 十二、保存场景的时机

建议保存三个阶段：

```text
夜景_3dsMax2025_01_资源已链接.max
夜景_3dsMax2025_02_相机灯光确认.max
夜景_3dsMax2025_03_最终渲染设置.max
```

这样某一步转换错误时可以回退，不必重新处理整个场景。

## 十三、常见故障

### 1. 打开场景长时间无响应

- 等待 5–15 分钟，观察内存和磁盘是否仍在活动。
- 大量 `.vrmesh` 和贴图第一次扫描会很慢。
- 不要连续双击场景启动多个 3ds Max 实例。

### 2. 树木全部消失

- 检查 `.vrmesh` 路径。
- 打开 Asset Tracking 查看是否 Missing。
- 检查 V-Ray Proxy 对象是否仍在场景中。

### 3. 建筑变成纯灰色或粉色

- 对应贴图缺失。
- 检查 External Files 和 Asset Tracking。
- 不要在缺失贴图状态下批量转换材质。

### 4. 渲染按钮不可用或使用 Arnold

- 在 F10 中把 Production Renderer 改为 V-Ray。
- 确认 V-Ray 6.20.06 已成功加载。

### 5. 渲染直接崩溃

- 先降为 1280×720。
- 使用 V-Ray CPU。
- 关闭过强的位移、毛发和不必要的 Render Elements。
- 检查是否有损坏的旧插件对象。
- 不要直接尝试 8K。

### 6. 5K 渲染内存不足

- 关闭其他大型软件。
- 先输出 3840×2160。
- 使用 Bucket 而不是超大 Progressive 缓冲。
- 保持树木为 V-Ray Proxy，不要全部转成 Editable Mesh。

## 十四、最安全的实际执行顺序

严格按以下顺序操作：

1. 打开工作副本。
2. 保留场景单位和 Gamma 设置。
3. 添加五个 External Files 根目录及其子目录。
4. 用 Shift+T 清除关键资源 Missing 状态。
5. 确认 V-Ray CPU 为生产渲染器。
6. 按 C 找到原相机，Shift+F 检查画面比例。
7. 用 1280×720、Noise 0.03 渲染测试图。
8. 检查建筑、树木、道路、灯光和曝光。
9. 保存“资源已链接”版本。
10. 切换 Bucket、Noise 0.01、Brute Force + Light Cache。
11. 添加 Mild VRayDenoiser。
12. 先渲染 1920×1080 确认图。
13. 最终渲染 5120×2880 PNG/EXR。
14. 从母版导出 3840×2160、质量 90–95 的 WebP，用于网页。

