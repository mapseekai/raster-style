# Raster Style v2 执行语义

本文件与主规范共同定义像元结果。执行计划包含已解析默认值、源修订及顺序、源有效性规则、工作网格、统计网格、固定色表、扩展版本、算法档案和编码选项。服务在读取像元前完成绑定与能力校验；无法满足所请求语义时明确拒绝。

## 1. 有效性与重采样

每个输入波段携带 `(value, valid)`，每个源像元携带 [0,1] 的 source_alpha。无源 Alpha 时取 1；整数 Alpha 按其声明位深的最大值归一化，浮点 Alpha 必须声明为 [0,1]。越界或非有限 Alpha 令该样本无效。源 mask 为布尔有效性，不重复当作 Alpha 相乘。

逐波段有效性为：源覆盖内、源 mask 有效、原始值有限、不匹配有效的 NoData 判断且 source_alpha > 0。nodata 覆盖源 NoData 值，不覆盖 mask 和覆盖范围；字符串 nan 表示 NaN NoData，其他非有限原始值同样无效。校准后出现非有限值再次标记无效。读取及重投影两个阶段都传递这些状态。

重采样以服务固定核中的权重 w 处理每个波段：仅有效且非零权重的样本贡献，输出值为 `sum(w×alpha×value)/sum(w×alpha)`，输出 Alpha 为 `clamp(sum(w×alpha)/sum(w),0,1)`，求和范围相同。没有贡献者、任一分母为零、输出 Alpha 为零或结果非有限时输出无效。负瓣核允许负权重，Alpha 在完成该次计算后裁剪；不得把无效值的数值填充参与求和。nearest 直接复制选中样本，选中样本无效则输出无效，不另找邻居。

mode 仅使用非负贡献权重，按类别累加 `w×alpha`，最大者获胜；并列取最小类别值。输出 Alpha 为获胜类别贡献者的 `sum(w×alpha)/sum(w)`。类别值不取整。数据存在覆盖金字塔时，分类 renderer 仅允许经过类别保持验证的层级；缺少证明时读取可保持类别的层级或拒绝该能力。

每个计算输出携带所消费有效输入的最小 Alpha；where 只消费条件与被选分支，常量表达式继承源覆盖 Alpha。RGB 对三个输出 valid 求交并取最小 Alpha。任一输出在 range_policy=transparent 下越界时，RGB 整像元无效。single_color 只使用 valid 和 Alpha，输入数值 0 或负值不会被当作 false。

## 2. 扩展与阶段顺序

扩展保持网格、通道数量、通道顺序和 Alpha，可将有效像元标记为无效，但不能使无效像元重新有效。before_channels 保持输入波段号；after_channels 保持 renderer 输出的含义与单位；类别和地形路径分别保持类别编码与高程单位。after_color 处理 [0,1] 非预乘 sRGB，操作结束裁剪颜色并保留 Alpha。注册时声明这些约束并用服务测试验证；不满足者拒绝注册为该阶段扩展。

同阶段扩展按 ID 的 ASCII 字典序执行。对有 S 个源的请求：

| 阶段 | before_channels 镶嵌 | after_channels 镶嵌 |
|---|---|---|
| 读取、校准、before_channels 扩展 | 每源执行，共 S 次 | 每源执行，共 S 次 |
| before_channels 镶嵌 | 一次 | 跳过 |
| 通道计算、after_channels 扩展 | 在镶嵌结果上一次 | 每源执行，共 S 次 |
| after_channels 镶嵌 | 跳过 | 一次 |
| 统计、渲染、after_color 扩展 | 合并结果上一次 | 合并结果上一次 |

单源依同一流程执行，省略 mosaic 相当于跳过合并。多源必须显式选择 pixel_selection 和 stage。

## 3. 镶嵌元组与 Alpha

before_channels 元组由整个输入依赖表组成，after_channels 元组由所有输出通道组成。仅所有分量有效且 Alpha > 0 的元组参与；不同源的有效通道不能拼成一个元组。元组 Alpha 取分量 Alpha 的最小值。源顺序固定在执行计划中。

- first 取第一个有效元组，包括其 Alpha。
- highest/lowest 按 rank_channel 的数值选择整个元组，包括其 Alpha；并列取源顺序最前者。
- mean/median 对同一组有效元组逐通道进行等权算术聚合；不以 Alpha 改变数值权重。偶数 median 取中间两值的均值。两者的输出 Alpha 都取贡献元组 Alpha 的算术平均。
- 没有有效元组时输出透明。category 路径拒绝 mean/median。

rank_channel 是位置，不是源波段号。before_channels 依赖表去重后按原始波段号升序排列，after_channels 按 renderer 输出顺序排列。重复 bidx 只在输出阶段重复。源调色板模式要求所有源的规范化数值键与 RGBA 表完全一致，不能按获胜源切换色表。

## 4. 统计与退化范围

统计消费通道计算、扩展和镶嵌完成后的数值，早于 stretch、color_formula 和颜色映射。RGB 统计使用三个通道共同有效的元组，分别计算每通道结果；部分透明有效样本以等权计数。统计网格与输出工作网格均在计划中固定，统计计算在其网格上重放相同上游步骤。

dataset 要求一个绑定数据源，范围是该源足迹；mosaic 使用固定源集合的联合足迹；viewport 使用服务绑定的视图范围，跨瓦片共享同一快照。统计网格必须包含 CRS、变换、分辨率、宽高及范围 mask；缺失则服务报错，不能临时改成当前瓦片统计。

省略 statistics 时：单源选择 dataset，多源选择 mosaic，accuracy=sample，sample_size=1000000。显式 statistics 要求 scope 和 accuracy；exact 拒绝 sample_size。sample_size 省略的 sample 仍取 1000000。

`raster-statistics/1` 采样规则：将范围包围网格以行优先编号 0…N-1，K=min(sample_size,N)。K=1 时选择 floor((N-1)/2)；K>1 时选择 `floor(i×(N-1)/(K-1))`，i=0…K-1。范围 mask 外和无效样本丢弃，不补采。exact 遍历整个网格并丢弃相同的无效样本。排序、百分位与 CDF 仅使用剩余样本。

百分位对升序样本使用 h=(n-1)×p/100，线性插值相邻值；标准差为总体标准差。计算应使用可防溢出的缩放求和／方差算法。若数学结果无法表示为有限 binary64（例如 stddev 范围端点溢出），服务报统计计算错误，不把整个数据误当作 NoData。

| 状态 | 规范结果 |
|---|---|
| 无有效样本 | 统计标记 empty，依赖它的输出像元透明 |
| 范围 [c,c]，x=c | 有效 u=0.5 |
| 范围 [c,c]，x<c 或 x>c | clamp 分别取 0/1；transparent 输出无效 |
| 正常范围 [a,b] | 端点包含；内部 u=(x-a)/(b-a)，外部按 range_policy |
| curve 范围外 | clamp 使用首尾 u；transparent 输出无效 |

退化规则适用于 minmax、相等的 percentile 端点、stddev=0 以及只有一个唯一值的直方图。用户提供的 linear 范围仍要求 min<max。

histogram_equalization 使用经验 CDF：对唯一值 v0<…<vm 的计数 n0…nm，N=sum(ni)，`Fj=sum(n0…nj)/N`。m>0 时停靠点为 `(vj,(Fj-F0)/(1-F0))`，停靠点之间线性插值，范围外按 range_policy。m=0 使用上述退化规则。该算法不依赖后端默认直方图桶数。

ref 指向不可变快照；scope/accuracy 及显式或默认 sample_size 是匹配断言。快照还绑定源修订/顺序、NoData/mask/Alpha 定义、校准、依赖表、表达式或指数、重采样/overview、扩展、镶嵌、统计网格与范围、统计算法档案。任一依赖不匹配、引用不存在或不可访问时返回错误，不重算并覆盖该 ref。改变 Gamma 或色表可以复用仍匹配的统计快照。

## 5. 颜色与数值计算

核心数值档案为 `raster-color/1`。所有中间颜色保持 binary64；每个颜色操作结束裁剪到 [0,1]，Alpha 不变。颜色的 sRGB 解码为 `c/12.92`（c≤0.04045），否则 `((c+0.055)/1.055)^2.4`；线性分量编码为 `12.92c`（c≤0.0031308），否则 `1.055c^(1/2.4)-0.055`。

continuous 在相邻停靠点间计算 t，先在所选插值空间中预乘 Alpha，对四分量线性插值，再除以插值后的 Alpha；Alpha=0 时 RGB=0。linear_rgb 先解码，再预乘和插值，最后编码回 sRGB。under/over 只在严格超出首尾 stop 时使用；恰好命中 stop 返回其颜色。reverse 仅倒置颜色序列，保留各 value 及 under/over。

color_formula 的 saturation 使用 CIE Lab D65：sRGB 解码后按以下矩阵转 XYZ，白点是矩阵各行之和；对 X/Xn、Y/Yn、Z/Zn 使用 `f(t)=cbrt(t)`（t>(6/29)^3），否则 `t/(3×(6/29)^2)+4/29`。L=116f(Y/Yn)-16、a=500(f(X/Xn)-f(Y/Yn))、b=200(f(Y/Yn)-f(Z/Zn))。保持 L，将 a/b 同乘 value（等价于 Lch 保持 hue、缩放 chroma），逆变换后编码并裁剪。value=1 直接保持输入，避免无效的往返误差。

```text
XYZ = [0.4124564  0.3575761  0.1804375] × linear_RGB
      [0.2126729  0.7151522  0.0721750]
      [0.0193339  0.1191920  0.9503041]
```

逆矩阵取上述固定矩阵的数学逆；Lab 逆函数为 `f^-1(t)=t^3`（t>6/29），否则 `3×(6/29)^2×(t-4/29)`。post_color_formula 的 saturation 继续使用主规范的编码 sRGB luma 公式，两阶段不可互换。该档案固定数值目标；rio-color 等后端须通过适配器测试证明匹配，库名或版本本身不构成兼容证明。

稳定计算规则：

- 归一化先判断端点／范围外。如果 b-a 溢出，改用 `(x/2-a/2)/(b/2-a/2)`，避免有限合法范围产生 Infinity。
- 线性插值使用数学等价的稳定形式；例如异号端点采用 `(1-t)×a+t×b`，同号端点可用 `a+t×(b-a)`。均值和偶数中位数同样防止不必要的中间溢出。
- gamma 对 C=0/1 直接返回端点；其余计算 `exp(log(C)/value)`，允许下溢为 0。
- sigmoidal 对 C=0/1 直接返回端点；contrast<1e-12 时取连续极限 C，误差包含在下面的精度预算内。其余令 c=contrast、m=midpoint，计算 `exp(log(-expm1(-c×C))-log(-expm1(-c))+log1p(exp(-c×(1-m)))-softplus(c×(m-C)))`；`softplus(t)=max(t,0)+log1p(exp(-abs(t)))`。若 c×C 下溢为 0，第一项使用连续极限 log(c)+log(C)。禁止直接以两个舍入为相等的 logistic 值相减作分母。

仅显式色表索引和最终图像输出进行 8 位量化：令 t=255×clamp(c,0,1)，若 t 距最近半整数不超过 1e-10，则先吸附到该半整数，再取 floor(t+0.5)。这使数学上的半整数不会因浮点舍入偏差落入较小的字节值。此容差仅用于颜色量化；数据域类别匹配和分级边界不取整、不做近似相等判断。从整数 RGBA 色表读取时除以 255 恢复浮点。最终量化 Alpha=0 时写入透明黑色。

## 6. 地形

工作网格 x 向东、y 向北，水平单位为实际距离米；图像列向东、行向南。服务固定正交工作网格及其与输出网格的转换；投影坐标标注为米不自动等同于实际地面距离，须按部署网格策略处理比例因子。dx、dy 是正的地面像元间距。

Horn 邻域按图像行排列为：

```text
z1 z2 z3
z4 z5 z6
z7 z8 z9
```

所有 z 使用 after_channels 阶段保存的物理高程，foot 先乘 0.3048，再乘 z_factor。`p=((z3+2z6+z9)-(z1+2z4+z7))/(8dx)`，`q=((z1+2z2+z3)-(z7+2z8+z9))/(8dy)`，`n=normalize(-p,-q,1)`。九个样本任一无效则中心输出无效；中心 Alpha 继续沿用，邻居 Alpha 仅参与其有效性。

azimuth 从北起顺时针，altitude 从水平面向上，三角函数计算前转弧度。`s=(cos(alt)sin(az),cos(alt)cos(az),sin(alt))`，`h=max(0,dot(n,s))`。multidirectional 对 225/270/315/0 度的四个 h 分别截断后取算术平均，不能先平均光向量。

hillshade 输出编码 sRGB 的 `(h,h,h)`。shaded_relief 保留同一高程分支计算 h，颜色分支独立执行主规范 §5 的路径；将最终基色解码到线性 RGB，乘 `(1-strength)+strength×h`，再编码回 sRGB，保留颜色 Alpha。改变 stretch、Gamma、色带均不得改变 p/q/h。

瓦片边缘读取至少一圈真实邻域，经过所需的完整上游处理后计算；数据边缘缺样本按 edge=nodata。改变瓦片划分不能改变相同工作网格坐标处的高程邻域与光照。

## 7. 验收

[rendering-vectors.json](../../testdata/rendering-vectors.json)包含样式、输入、阶段值与预期 RGBA；[rendering_reference.py](../../scripts/rendering_reference.py)计算这些有界案例，作为规范检查工具，不是生产栅格渲染器。输入中的 null 表示无效样本，不是合法样式数值。示例扩展 `mapseek.test.square` 的注册行为为逐值平方，保持通道、网格、Alpha 和有效性，仅用于验证阶段顺序。

`kind=resample` 向量验证已给定双线性权重的数值与 Alpha 合成。input.stage 选择 read 或 reproject，省略时为 read；style.resampling 对应阶段必须显式为 bilinear。参考检查器拒绝其他方式（包括默认 nearest）；核权重生成及其他算法由实际后端独立验收。

参考阶段值默认绝对误差 ≤1e-9，向量可声明更适合物理量的 tolerance；边界选择、valid、源选择及整数 RGBA 必须精确相等。不得借助误差容限移动分级边界。部署后端须使用相同的已绑定输入运行这些案例，并增加真实读取、重投影、overview、跨瓦片邻域、统计快照失配、表达式 AST 拒绝、扩展注册与能力拒绝测试。

PNG 和无损 WebP 比较解码 RGBA，无需编码字节相同。JPEG／有损 WebP 在编码前先匹配参考 RGB；编码后的容差、色度采样、库版本与选项在部署档案中固定。所有缓存验收使用完整解析依赖的摘要，不能只对原始 JSON 做 hash。
