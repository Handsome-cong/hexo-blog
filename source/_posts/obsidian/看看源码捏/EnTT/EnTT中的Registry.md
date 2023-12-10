---
publish: false
title: EnTT源码解读【6】：EnTT中的Registry
date: 2023-12-06 17:42
tags: EnTT
categories: blog
series: EnTT源码解读
keywords: 
description: 
top_img: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
comments: 
cover: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
toc: 
toc_number: 
toc_style_simple: 
copyright: 
copyright_author: 
copyright_author_href: 
copyright_url: 
copyright_info: 
mathjax: 
katex: 
aplayer: 
highlight_shrink: 
aside: 
abcjs:
---
# EnTT 中的 Registry
## 什么是 Registry
在一般 ECS 实现里，通常会有一个*用于存储和管理所有 Entity 和 Component* 的类型，这个类型经常会以 World 命名，但 EnTT 中叫 **Registry**。

## EnTT 中 registry 的本质
EnTT 中的 `registry` 类型只是 `basic_registry<>` 的一个别名，

```cpp
// src/entt/entity/fwd.hpp

/*! @brief Default entity identifier. */
enum class entity : id_type {};

template<typename Entity = entity, typename = std::allocator<Entity>>
class basic_registry;

/*! @brief Alias declaration for the most common use case. */
using registry = basic_registry<>;
```

`registry` 默认使用自带的 `entity` 作为 Entity 的类型，`std::allocator<entity>` 作为内存分配器。

用户通过自定义 `basic_registry` 的模板参数来指定自己的 Entity 类型，合法的 Entity 类型见 [EnTT中的Entity > EnTT 中的 Entity 是什么](../../blog/EnTT中的Entity#EnTT 中的 Entity 是什么)。

## registry 提供的功能
### create
创建