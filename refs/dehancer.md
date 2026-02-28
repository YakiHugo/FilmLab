# Dehancer 胶片风格系统调研

> 本文档将 Dehancer 的"胶片风格"拆解为可复现的组成模块，详细说明其**能力边界、工作链路、关键工具的模拟对象/作用机理/参数逻辑/使用要点**（基于官方 Learn/Articles，辅以少量第三方评测）。

---

## 目录

1. [胶片风格的五大构成要素](#1-胶片风格的五大构成要素)
2. [能力清单：Dehancer 能做什么](#2-能力清单dehancer-能做什么)
3. [冲印链路：内部处理顺序](#3-冲印链路内部处理顺序)
4. [核心风格模块详解](#4-核心风格模块详解)
5. [色彩管理与工作流](#5-色彩管理与工作流)
6. [性能分层](#6-性能分层)

---

## 1. 胶片风格的五大构成要素

Dehancer 的"胶片味"由以下 5 组因素叠加而成：

### 1.1 色彩与对比

- **模拟对象**：负片/正片的色彩科学 + 特性曲线
- **实现工具**：Film Profiles（胶片库）+ Push/Pull（曝光/冲洗推动）

### 1.2 动态范围与高光行为

- **模拟对象**：胶片"亮部不硬截断"的特性
- **实现工具**：Film Compression（高光压缩）+ Expand（黑白点/动态范围匹配）

### 1.3 冲印链与打印阶段

- **模拟对象**：负片 → 光学放印 → 印片/相纸的完整链路
- **实现工具**：Print（印片/相纸）+ CMY Color Head（暗房放印机滤色头）

### 1.4 材质感的微观与光学缺陷

| 效果         | 说明                                     |
| ------------ | ---------------------------------------- |
| **Grain**    | 颗粒，程序化 3D 模型，非贴图叠加         |
| **Halation** | 卤光/红晕，高亮边缘渗透/回散射           |
| **Bloom**    | 高亮扩散辉光，来自镜头散射并在乳剂层放大 |

### 1.5 机械与介质痕迹（随机性）

| 效果            | 说明                                     |
| --------------- | ---------------------------------------- |
| **Film Breath** | 逐帧曝光/对比/颜色轻微漂移               |
| **Gate Weave**  | 片门抖动/画面微摆                        |
| **Film Damage** | 灰尘/毛发/划痕，真实样本+生成变换        |
| **Overscan**    | 片门/齿孔/边界信息外露，真实扫描纹理混合 |
| **Vignette**    | 暗角/边缘压光并影响对比感                |

> **核心理念**：Dehancer 是一套"暗房/冲印工作流"的数字复现，而非简单 LUT。工具按 `Input → Film → Expand → Print → Color Head → FX → Output` 组织。

---

## 2. 能力清单：Dehancer 能做什么

### 2.1 胶片与显影

- 60+ Film Profiles，支持 Push/Pull
- Print Films：Kodak 2383、Fujifilm 3513
- Photo Papers：Kodak Endura、Bromportrait
- Film Developer（显影液配方调配）

### 2.2 动态与色彩控制

- Film Compression（高光压缩的胶片式 roll-off）
- Expand（匹配黑白点/动态范围）
- CMY Color Head + Print Toning（减色校正）

### 2.3 材质与特效

- Grain / Halation / Bloom
- Film Breath / Gate Weave / Film Damage / Overscan / Vignette

### 2.4 输出与监看

- LUT Generator（导出 17³ 或 33³ LUT）
- Monitor（False Color、Clipping 等技术监看）

### 2.5 输入与色彩管理

- Input & Camera Profiles（Log/RAW/色彩空间解释）
- 高级色彩管理管线（Pro OFX 支持 ACES、DaVinci WG/Intermediate、Cineon Film Log）

---

## 3. 冲印链路：内部处理顺序

```
Input → Film → Expand → Print → Color Head → FX → Output
```

### 3.1 Input（输入解释）

- **目的**：把数码素材"翻译对"
- **方法**：自带 camera profiles、CST、ACES IDT、厂商 LUT、Camera RAW、手动 de-log 等
- **注意**：自带 profiles 主要面向低对比 Log；Rec.709 素材应按 Rec.709 处理

### 3.2 Expand（特殊定位）

- **位置**：Input 与 Film Profiles 之间
- **作用**：让 profile 自己压缩/展开阴影与高光，避免硬截断，使 roll-off 更平滑
- **区别**：不是"修正 film profile 的结果"，而是预处理

### 3.3 Film Profiles（核心）

- 每个 profile 是对真实介质的采样
- **Push/Pull(Ev)**：基于 3 种不同曝光状态采样，推拉会改变色彩/对比性格，非简单亮度调整

### 3.4 Print（最后一公里）

- **理念**：负片的正统解释方式是光学放印，而非扫描器算法
- **选项**：
  - Kodak 2383 Print Film
  - Kodak Endura Paper
  - Cineon Film Log printing
- **Target White**：5500–6500K（打印光源色温）

### 3.5 Color Head（CMY 滤色头）

- **原理**：光学彩色放印的 YMC 滤色片减色校正
- **实现**：使用真实测量的滤色值（互补色对：Y–B、M–G、C–R）
- **Print Toning**：基于"分区/分次打印"思路自动 masking，保留"滤色影响曝光"的真实行为

---

## 4. 核心风格模块详解

### 4.1 Film Compression｜胶片式高光压缩

- **作用**：模拟"把高光往中间调重新分配"
- **特点**：阴影/中低调尽量不受影响，主要针对亮部 roll-off
- **效果**：高光"不塑料、不硬顶"

### 4.2 Film Developer｜暗房技师

> 允许"调配显影液配方"，在不换胶片的情况下获得类似"换显影/改工艺"的变化空间。

| 参数                 | 说明                                           |
| -------------------- | ---------------------------------------------- |
| **Contrast Boost**   | 显影对比度（温度/浓度等化学因素），可正可负    |
| **Gamma Correction** | 控制中间调向暗/亮偏移（需 Contrast Boost ≠ 0） |
| **Color Separation** | 模拟乳剂分层造成的颜色分离/饱和行为            |

### 4.3 Grain｜图像由颗粒构成

- **技术**：数学 3D 模型的程序化颗粒，基于真实乳剂物理属性
- **理念**：Grain 不是 overlay，image consists of grain
- **选项**：8/16/35/65mm 规格，ISO 50/250/500 等

### 4.4 Halation｜卤光

- **现象**：高光边缘的红/橙晕
- **与 Bloom 关系**：常一起出现但物理机制不同，最终观感可能是"复合的大光晕"
- **联动**：与 Defringe（去色散）联动
- **参数**：
  - Hue：调整乳剂绿层对散射光的敏感度（冷红到暖黄）
  - Blue Compensation：处理冷色背景对卤光的抑制

### 4.5 Bloom｜高亮扩散辉光

- **来源**：光学系统的亮部扩散，在多层乳剂中被放大
- **区别**：只在光源/高亮附近出现，与普通 soft filter 不同
- **选项**：8/16/35/65mm 规格 profiles

### 4.6 Film Breath & Gate Weave｜让数字画面呼吸

| 效果            | 来源                             | 参数特点           |
| --------------- | -------------------------------- | ------------------ |
| **Film Breath** | 乳剂涂布不均、显影偏差、快门不稳 | 小数值更快更"抖"   |
| **Gate Weave**  | 片门/放映/扫描传动的微摆动       | 给数字电影注入生命 |

### 4.7 Film Damage｜时间的痕迹

- **实现**：成千上万真实胶片样本 + 生成/变换算法
- **模块**：拆分多个模块分别处理不同缺陷
- **理念**："自然的脏"带来时间感，数字素材常反向添加

### 4.8 Overscan｜片门外露

- **用途**：保留扫描时通常被裁掉的片门外信息
- **实现**：真实扫描纹理混合方案
- **特点**：性能影响小，纹理包体积低
- **定位**：stylization rather than imitation（风格化而非完全模仿）

### 4.9 Vignette｜暗角

- **参数**：中心偏移、羽化、比例等完整几何控制
- **注意**：会增加边缘与中心对比，可能导致局部暗部更易剪切，建议在流程早期考虑

---

## 5. 色彩管理与工作流

### 5.1 Pro OFX 高级管线

| 支持标准                    | 特点                              |
| --------------------------- | --------------------------------- |
| **ACEScct AP1**             | 更平滑的色彩与调性                |
| **DaVinci WG/Intermediate** | 高饱和高光（霓虹等）更多 headroom |
| **Cineon Film Log**         | 传统胶片工作流兼容                |

### 5.2 Lite 版本

- Rec.709 / Rec.2020(SDR) / Apple Gamma 2.0 等基础标准

### 5.3 Photo 插件

- 处理：浮点精度"近乎无限空间"
- 输入输出：sRGB IEC61966-2.1
- **理念**：印片介质本身的色域压缩使胶片模拟通常不需要比 sRGB 更宽的色域

---

## 6. 性能分层

### 6.1 轻量工具（老机器可能实时）

Input、Film、Expand、Print、Color Head、Vignette、Film Breath、Gate Weave、False Color

### 6.2 重型工具（计算量大，易掉帧）

Film Grain、Halation、Bloom

---

## 总结

Dehancer 的核心价值在于：

1. **完整的冲印链路模拟**：从负片到光学放印到印片/相纸的全流程数字化复现
2. **物理真实的颗粒模型**：程序化 3D 颗粒而非贴图叠加
3. **暗房工作流的数字化**：CMY Color Head、Print Toning 等工具的引入
4. **可定制的显影配方**：Film Developer 提供类似真实暗房的调配空间

它不是 LUT 叠加器，而是一套完整的"数字暗房"系统。
