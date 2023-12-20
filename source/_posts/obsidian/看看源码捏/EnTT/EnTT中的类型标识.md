---
publish: true
title: EnTT源码解读【8】：EnTT中的类型标识
date: 2023-12-20 14:13
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
# EnTT 中的类型标识
## 这个功能存在的意义
显然，C++ 中并没有完善的 RTTI 支持，对于没有 vtable 的类型而言，程序在运行时无法获取任何关于它的类型信息，而 ECS 中又需要一种办法在运行时区分 Component 的类型。

## EnTT中提供的功能
### `type_info`
这是一个用于在运行时提供类型信息的类型
```cpp
// src/entt/core/type_info.hpp

/*! @brief Implementation specific information about a type. */
struct type_info final {
    /**
     * @brief Constructs a type info object for a given type.
     * @tparam Type Type for which to construct a type info object.
     */
    template<typename Type>
    constexpr type_info(std::in_place_type_t<Type>) noexcept
        : seq{type_index<std::remove_cv_t<std::remove_reference_t<Type>>>::value()},
          identifier{type_hash<std::remove_cv_t<std::remove_reference_t<Type>>>::value()},
          alias{type_name<std::remove_cv_t<std::remove_reference_t<Type>>>::value()} {}

    /**
     * @brief Type index.
     * @return Type index.
     */
    [[nodiscard]] constexpr id_type index() const noexcept {
        return seq;
    }

    /**
     * @brief Type hash.
     * @return Type hash.
     */
    [[nodiscard]] constexpr id_type hash() const noexcept {
        return identifier;
    }

    /**
     * @brief Type name.
     * @return Type name.
     */
    [[nodiscard]] constexpr std::string_view name() const noexcept {
        return alias;
    }

private:
    id_type seq;
    id_type identifier;
    std::string_view alias;
};
```

它包含三个部分：
- `seq`：从0开始全局自增的值，每一个类型都会获取到一个唯一的值
- `identifier`：默认情况下为一个hash值，通过类型名算出，算法为FNV1a，否则与`seq`一致
- `alias`：默认情况下为类型名，形如：`struct my_namespace::my_struct`，否则为`""`

> 上述的默认情况下是指没有定义了`ENTT_STANDARD_CPP`宏，且编译器是clang、gunc或msvc之一。
>   
> 这是因为获取类型名的功能需要预定义宏的支持：
> - clang和gunc：`__PRETTY_FUNCTION__`
> - msvc：`__FUNCSIG__`
> 
> 该功能通过上面的预定义宏来获取模板函数名，并截取其中的模板参数部分以获取传入的模板类型名来实现。

### `type_id`
一个用于方便获取`type_info`的函数：
```cpp
/**
 * @brief Returns the type info object associated to a given type.
 *
 * The returned element refers to an object with static storage duration.<br/>
 * The type doesn't need to be a complete type. If the type is a reference, the
 * result refers to the referenced type. In all cases, top-level cv-qualifiers
 * are ignored.
 *
 * @tparam Type Type for which to generate a type info object.
 * @return A reference to a properly initialized type info object.
 */
template<typename Type>
[[nodiscard]] const type_info &type_id() noexcept {
    if constexpr(std::is_same_v<Type, std::remove_cv_t<std::remove_reference_t<Type>>>) {
        static type_info instance{std::in_place_type<Type>};
        return instance;
    } else {
        return type_id<std::remove_cv_t<std::remove_reference_t<Type>>>();
    }
}

/*! @copydoc type_id */
template<typename Type>
[[nodiscard]] const type_info &type_id(Type &&) noexcept {
    return type_id<std::remove_cv_t<std::remove_reference_t<Type>>>();
}
```

传入的模板参数会自动*忽略引用和顶级的cv修饰符*，函数返回一个全局的`type_info`实例的引用。