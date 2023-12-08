---
publish: true
title: EnTT源码解读【2】：EnTT中的Component
date: 2023-12-05 21:45
updated: 星期二 5日 十二月 2023 21:45:47
tags: EnTT
categories: 源码解读
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
# EnTT 中的 Component
## Component 是什么
**Component**是 ECS 的三个核心成员之一，它*代表了附加在 Entity 上的数据*。

一般来说 Component 应该是纯数据类型，不包含任何行为。

## EnTT 中的 Component
### component_traits
EnTT 中没有为 Component 指定一个公共的基类，只是用模板做了限制。

```cpp
// src/entt/entity/component.hpp

template<typename Type, typename = void>
struct component_traits {
    static_assert(std::is_same_v<std::decay_t<Type>, Type>, "Unsupported type");

    /*! @brief Component type. */
    using type = Type;

    /*! @brief Pointer stability, default is `false`. */
    static constexpr bool in_place_delete = internal::in_place_delete<Type>::value;
    /*! @brief Page size, default is `ENTT_PACKED_PAGE` for non-empty types. */
    static constexpr std::size_t page_size = internal::page_size<Type>::value;
};
```

在 `static_assert` 那行，EnTT 限定了 Component 的类型必须为*不含 cv 限定符的基本或类（结构体）类型*。

同时 EnTT 提供了两个可选的配置项 `in_place_delete` 和 `page_size`。

### in_place_delete
对于 `in_place_delete`，定义如下：
```cpp
// src/entt/entity/component.hpp

template<typename Type, typename = void>
struct in_place_delete: std::bool_constant<!(std::is_move_constructible_v<Type> && std::is_move_assignable_v<Type>)> {};

template<>
struct in_place_delete<void>: std::false_type {};

template<typename Type>
struct in_place_delete<Type, std::enable_if_t<Type::in_place_delete>>
    : std::true_type {};
```

默认情况下，对于同时具有移动构造和移动赋值能力的类型，`in_place_delete` 为 `false`。

用户可以通过在自己的 Component 类型中添加如下静态成员来指定 `in_place_delete` 的值：
```cpp
static constexpr bool in_place_delete = true;
```

需要注意的是，*自定义的 `in_place_delete` 只有在默认情况下是 `false`，然后手动指定为 `true` 的时候才有意义，对于默认就为 `true` 的情况，指定为 `false` 不会有任何效果。*

### page_size
对于 `page_size`，定义如下：
```cpp
// src/entt/config/config.h

#ifndef ENTT_PACKED_PAGE
#    define ENTT_PACKED_PAGE 1024
#endif

#ifdef ENTT_NO_ETO
#    define ENTT_ETO_TYPE(Type) void
#else
#    define ENTT_ETO_TYPE(Type) Type
#endif

// src/entt/entity/component.hpp

template<typename Type, typename = void>
struct page_size: std::integral_constant<std::size_t, !std::is_empty_v<ENTT_ETO_TYPE(Type)> * ENTT_PACKED_PAGE> {};

template<>
struct page_size<void>: std::integral_constant<std::size_t, 0u> {};

template<typename Type>
struct page_size<Type, std::void_t<decltype(Type::page_size)>>
    : std::integral_constant<std::size_t, Type::page_size> {};
```

- `ENTT_PACKED_PAGE`：默认的页大小，1024 字节
- `ENTT_ETO_TYPE`：用于空类型优化，如果指定的 Component 类型为空类型，则将 `page_size` 设为 0，可以通过宏定义 `ENTT_NO_ETO` 来关闭

用户可以通过在自己的 Component 类型中添加如下静态成员来指定 `page_size` 的值：
```cpp
static constexpr std::size_t page_size = 1024;
```

对于指定了自定义 `page_size` 的空类型，以用户指定的值为准。