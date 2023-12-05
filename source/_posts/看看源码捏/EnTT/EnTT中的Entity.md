---
publish: true
title: EnTT源码解读【1】：EnTT中的Entity
date: 2023-12-05 16:46
updated: 星期二 5日 十二月 2023 16:46:36
tags:
categories:
keywords:
description:
top_img: https://cdn.donmai.us/original/95/91/959142ad556665861f75fd0fe20f1ea5.png
comments:
cover:
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
# EnTT 中的 Entity
## Entity 是什么
Entity 是 ECS 的三个核心成员之一，它代表了游戏或应用中的独立个体。

Entity 本身是个很抽象的概念，既非数据，也无行为，它更像是一个把数据组织起来的索引。

## EnTT 中的 Entity 是什么
在 EnTT 中 entity 的类型是一个 `enum class`，其本质上是一个 32(64) 位的无符号整型。

```cpp
// src/entt/entity/fwd.hpp
/*! @brief Default entity identifier. */
enum class entity : id_type {};
```

应是出于防止用户和整型混淆的目的而使用了 `enum class`。

其中 `id_type` 是一个可以由用户自定义的类型，但只能在 `std::uint32_t` 和 `std::uint64_t` 之间二选一，原因在后面有提到。

```cpp
// src/entt/config/config.h
#ifndef ENTT_ID_TYPE
#    include <cstdint>
#    define ENTT_ID_TYPE std::uint32_t
#else
#    include <cstdint> // provides coverage for types in the std namespace
#endif

// src/entt/core/fwd.hpp
/*! @brief Alias declaration for type identifiers. */
using id_type = ENTT_ID_TYPE;
```

## EnTT 中 entity 的构成
> 此处代码均位于 src/entt/entity/entity.hpp
### "entity" 和 "verison"
EnTT 中，entity 被分为两部分，"entity" 和 "version"，他们存于同一个整型中，用掩码加以区分。

- "entity" 部分代表这个 entity 的身份，可以理解为真正的 id
- "version" 部分则代表了这个 entity 是否还“活着”，能否被使用

```cpp

namespace internal {

// waiting for C++20 and std::popcount
template<typename Type>
constexpr int popcount(Type value) noexcept {
    return value ? (int(value & 1) + popcount(value >> 1)) : 0;
}

template<typename, typename = void>
struct entt_traits;

template<typename Type>
struct entt_traits<Type, std::enable_if_t<std::is_enum_v<Type>>>
    : entt_traits<std::underlying_type_t<Type>> {
    using value_type = Type;
};

template<typename Type>
struct entt_traits<Type, std::enable_if_t<std::is_class_v<Type>>>
    : entt_traits<typename Type::entity_type> {
    using value_type = Type;
};

template<>
struct entt_traits<std::uint32_t> {
    using value_type = std::uint32_t;

    using entity_type = std::uint32_t;
    using version_type = std::uint16_t;

    static constexpr entity_type entity_mask = 0xFFFFF;
    static constexpr entity_type version_mask = 0xFFF;
};

template<>
struct entt_traits<std::uint64_t> {
    using value_type = std::uint64_t;

    using entity_type = std::uint64_t;
    using version_type = std::uint32_t;

    static constexpr entity_type entity_mask = 0xFFFFFFFF;
    static constexpr entity_type version_mask = 0xFFFFFFFF;
};

} // namespace internal
```

简单来说，上面的代码就做了一件事，根据 entity 的类型来指定它的 "entity" 和 "version" 部分各占据了多少空间：
- 对于 entity 是 `std::uint32_t` 的情况，*"version" 占用高 12 位，"entity" 占用低 20 位*
- 对于 entity 是 `std::uint64_t` 的情况，*"version" 占用高 32 位，"entity" 占用低 32 位*

并且代码中只对 `std::uint32_t` 和 `std::uint64_t` 做了处理，因此只能使用这两个类型。

### 一些实用方法

```cpp

/**
 * @brief Common basic entity traits implementation.
 * @tparam Traits Actual entity traits to use.
 */
template<typename Traits>
class basic_entt_traits {
    static constexpr auto length = internal::popcount(Traits::entity_mask);

    static_assert(Traits::entity_mask && ((typename Traits::entity_type{1} << length) == (Traits::entity_mask + 1)), "Invalid entity mask");
    static_assert((typename Traits::entity_type{1} << internal::popcount(Traits::version_mask)) == (Traits::version_mask + 1), "Invalid version mask");

public:
    /*! @brief Value type. */
    using value_type = typename Traits::value_type;
    /*! @brief Underlying entity type. */
    using entity_type = typename Traits::entity_type;
    /*! @brief Underlying version type. */
    using version_type = typename Traits::version_type;

    /*! @brief Entity mask size. */
    static constexpr entity_type entity_mask = Traits::entity_mask;
    /*! @brief Version mask size */
    static constexpr entity_type version_mask = Traits::version_mask;

    [[nodiscard]] static constexpr entity_type to_integral(const value_type value) noexcept {
        return static_cast<entity_type>(value);
    }

    [[nodiscard]] static constexpr entity_type to_entity(const value_type value) noexcept {
        return (to_integral(value) & entity_mask);
    }

    [[nodiscard]] static constexpr version_type to_version(const value_type value) noexcept {
        return (static_cast<version_type>(to_integral(value) >> length) & version_mask);
    }

    [[nodiscard]] static constexpr value_type next(const value_type value) noexcept {
        const auto vers = to_version(value) + 1;
        return construct(to_integral(value), static_cast<version_type>(vers + (vers == version_mask)));
    }

    [[nodiscard]] static constexpr value_type construct(const entity_type entity, const version_type version) noexcept {
        return value_type{(entity & entity_mask) | (static_cast<entity_type>(version & version_mask) << length)};
    }

    [[nodiscard]] static constexpr value_type combine(const entity_type lhs, const entity_type rhs) noexcept {
        return value_type{(lhs & entity_mask) | (rhs & (version_mask << length))};
    }
};
```

以上代码只是为 entity 提供了一些实用方法：
- to_integral 只是简单做个类型转换
- to_entity 获取 "entity" 部分
- to_version 获取 "version" 部分
- next 获取一个新的 "version" 部分 +1 的 entity，若 "version" 已经达到最大值则重置为 0
- construct 通过指定的 "entity" 和 "version" 部分来创建一个 entity，"version" 参数在低位取模后左移，接着和 "entity" 做或操作
- combine 从两个参数中分别提取低位和高位做或操作

> `construct(entity, version)` 相当于 `combine(entity, version << length)`

### null 和 tombstone
```cpp
/*! @brief Null object for all identifiers.  */
struct null_t {
    template<typename Entity>
    [[nodiscard]] constexpr operator Entity() const noexcept {
        using traits_type = entt_traits<Entity>;
        constexpr auto value = traits_type::construct(traits_type::entity_mask, traits_type::version_mask);
        return value;
    }
    [[nodiscard]] constexpr bool operator==([[maybe_unused]] const null_t other) const noexcept {
        return true;
    }
    [[nodiscard]] constexpr bool operator!=([[maybe_unused]] const null_t other) const noexcept {
        return false;
    }
    template<typename Entity>
    [[nodiscard]] constexpr bool operator==(const Entity entity) const noexcept {
        using traits_type = entt_traits<Entity>;
        return traits_type::to_entity(entity) == traits_type::to_entity(*this);
    }
    template<typename Entity>
    [[nodiscard]] constexpr bool operator!=(const Entity entity) const noexcept {
        return !(entity == *this);
    }
};
template<typename Entity>
[[nodiscard]] constexpr bool operator==(const Entity entity, const null_t other) noexcept {
    return other.operator==(entity);
}
template<typename Entity>
[[nodiscard]] constexpr bool operator!=(const Entity entity, const null_t other) noexcept {
    return !(other == entity);
}

/*! @brief Tombstone object for all identifiers.  */
struct tombstone_t {
    template<typename Entity>
    [[nodiscard]] constexpr operator Entity() const noexcept {
        using traits_type = entt_traits<Entity>;
        constexpr auto value = traits_type::construct(traits_type::entity_mask, traits_type::version_mask);
        return value;
    }
    [[nodiscard]] constexpr bool operator==([[maybe_unused]] const tombstone_t other) const noexcept {
        return true;
    }
    [[nodiscard]] constexpr bool operator!=([[maybe_unused]] const tombstone_t other) const noexcept {
        return false;
    }
    template<typename Entity>
    [[nodiscard]] constexpr bool operator==(const Entity entity) const noexcept {
        using traits_type = entt_traits<Entity>;
        return traits_type::to_version(entity) == traits_type::to_version(*this);
    }
    template<typename Entity>
    [[nodiscard]] constexpr bool operator!=(const Entity entity) const noexcept {
        return !(entity == *this);
    }
};
template<typename Entity>
[[nodiscard]] constexpr bool operator==(const Entity entity, const tombstone_t other) noexcept {
    return other.operator==(entity);
}
template<typename Entity>
[[nodiscard]] constexpr bool operator!=(const Entity entity, const tombstone_t other) noexcept {
    return !(other == entity);
}

inline constexpr null_t null{};
inline constexpr tombstone_t tombstone{};
```

以上代码分别定义了两个常量 `entt::null` 和 `entt::tombstone`，前者表示“空”类型为 `entt::null_t`，后者表示 entity“死”了，或者说失效了，类型为 `entt::tombstone_t`。

它们本身不是 entity 类型，也不包含任何字段，但是可以隐式得转换为一个每一位都为 1 的 entity。

`entt::null_t` 与同类型的 `==` 永远为 `true`，`!=` 永远为 `false`，`entt::tombstone_t` 同理。

它们的不同在于：
- `entt::null_t` 与 entity 类型的 `==` 仅判断 *"entity" 部分是否相等 *，既 "entity" 是否全为 1。
- `entt::tombstone_t` 与 entity 类型的 `==` 仅判断 *"version" 部分是否相等 *，既 "version" 是否全为 1。