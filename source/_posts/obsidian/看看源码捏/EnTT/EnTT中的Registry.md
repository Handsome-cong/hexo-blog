---
publish: false
title: EnTT源码解读【X】：EnTT中的Registry
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

registry 涉及众多，等下面的更新完了再更新 registry

**WIP:**
- [ ] Group
- [x] Dense Map
- [x] type_id

## 什么是 Registry
在一般 ECS 实现里，通常会有一个*用于存储和管理所有 Entity 和 Component* 的类型，这个类型经常会以 World 命名，但 EnTT 中叫 **Registry**。

Registry 是 EnTT 中将 Entity、Component 以及 System 组织起来的核心，一个 Registry 对象代表了一个 ECS 系统。

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

## registry 的基本功能
### 创建/销毁 Entity
```cpp
// constructs a naked entity with no components and returns its identifier
auto entity = registry.create();

// destroys an entity and all its components
registry.destroy(entity);

registry.clear();
```

1. 创建 Entity
2. 删除 Entity
3. 删除所有 Entity

### 筛选 Entity
```cpp
// destroys all the entities in a range
auto view = registry.view<a_component, another_component>();
registry.destroy(view.begin(), view.end());
```

1. 筛选出了所有的同时具有 `a_component` 和 `another_component` 的 Entity
2. 将所有符合的 Entity 销毁

### 为 Entity 附加 Component
```cpp
registry.emplace<position>(entity, 0., 0.);

// ...

auto &vel = registry.emplace<velocity>(entity);
vel.dx = 0.;
vel.dy = 0.;

// default initialized type assigned by copy to all entities
registry.insert<position>(first, last);

// user-defined instance assigned by copy to all entities
registry.insert(from, to, position{0., 0.});
```

1. `emplace` 用于原地构造 Component
2. `insert` 用于插入现成的 Component

### 查询 Component 是否存在
```cpp
// true if entity has all the given components
bool all = registry.all_of<position, velocity>(entity);

// true if entity has at least one of the given components
bool any = registry.any_of<position, velocity>(entity);
```
1. `all_of` 判断 Entity 是否具有所有指定 Component
2. `any_of` 判断是否具有至少一个指定 Component

### 删除 Component
```cpp
registry.erase<position>(entity);
registry.remove<position>(entity);
registry.clear<position>();
```
1. 删除从指定的 `entity` 上删除 `position`，不判断 `position` 是否存在，不存在则报错
2. 删除从指定的 `entity` 上删除 `position`，判断 `position` 是否存在，不存在不报错
3. 删除所有 `position`

### 从 Entity 上获取 Component
```cpp
const auto &cregistry = registry;

// const and non-const reference
const auto &crenderable = cregistry.get<renderable>(entity);
auto &renderable = registry.get<renderable>(entity);

// const and non-const references
const auto [cpos, cvel] = cregistry.get<position, velocity>(entity);
auto [pos, vel] = registry.get<position, velocity>(entity);
```
也提供了 `try_get` 用于不确定 Component 是否存在的情况。

## registry 的基本原理
### 数据存储
`registry` 的字段定义如下：
```cpp
// src/entt/entity/fwd.hpp

/**
 * @brief Provides a common way to define storage types.
 * @tparam Type Storage value type.
 * @tparam Entity A valid entity type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Type, typename Entity = entity, typename Allocator = std::allocator<Type>, typename = void>
struct storage_type {
    /*! @brief Type-to-storage conversion result. */
    using type = sigh_mixin<basic_storage<Type, Entity, Allocator>>;
};

/**
 * @brief Helper type.
 * @tparam Args Arguments to forward.
 */
template<typename... Args>
using storage_type_t = typename storage_type<Args...>::type;

/**
 * Type-to-storage conversion utility that preserves constness.
 * @tparam Type Storage value type, eventually const.
 * @tparam Entity A valid entity type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Type, typename Entity = entity, typename Allocator = std::allocator<std::remove_const_t<Type>>>
struct storage_for {
    /*! @brief Type-to-storage conversion result. */
    using type = constness_as_t<storage_type_t<std::remove_const_t<Type>, Entity, Allocator>, Type>;
};

// src/entt/entity/registry.hpp

template<typename Allocator>
class registry_context {
    using alloc_traits = std::allocator_traits<Allocator>;
    using allocator_type = typename alloc_traits::template rebind_alloc<std::pair<const id_type, basic_any<0u>>>;

private:
    dense_map<id_type, basic_any<0u>, identity, std::equal_to<id_type>, allocator_type> ctx;
};

template<typename Entity, typename Allocator>
class basic_registry {
    using base_type = basic_sparse_set<Entity, Allocator>;

    using alloc_traits = std::allocator_traits<Allocator>;

    // std::shared_ptr because of its type erased allocator which is useful here
    using pool_container_type = dense_map<id_type, std::shared_ptr<base_type>, identity, std::equal_to<id_type>, typename alloc_traits::template rebind_alloc<std::pair<const id_type, std::shared_ptr<base_type>>>>;
    using group_container_type = dense_map<id_type, std::shared_ptr<internal::group_descriptor>, identity, std::equal_to<id_type>, typename alloc_traits::template rebind_alloc<std::pair<const id_type, std::shared_ptr<internal::group_descriptor>>>>;

	...

    /*! @brief Entity traits. */
    using traits_type = typename base_type::traits_type;
    /*! @brief Allocator type. */
    using allocator_type = Allocator;
    /*! @brief Underlying entity identifier. */
    using entity_type = typename traits_type::value_type;
    /*! @brief Underlying version type. */
    using version_type = typename traits_type::version_type;
    /*! @brief Unsigned integer type. */
    using size_type = std::size_t;
    /*! @brief Common type among all storage types. */
    using common_type = base_type;
    /*! @brief Context type. */
    using context = internal::registry_context<allocator_type>;

    /**
     * @copybrief storage_for
     * @tparam Type Storage value type, eventually const.
     */
    template<typename Type>
    using storage_for_type = typename storage_for<Type, Entity, typename alloc_traits::template rebind_alloc<std::remove_const_t<Type>>>::type;

	...

private:
    context vars;
    pool_container_type pools;
    group_container_type groups;
    storage_for_type<entity_type> entities;
};
```

从上述代码可以看出，registry 被分为 4 部分：
- `context vars`
- `pool_container_type pools`
- `group_container_type groups`
- `storage_for_type<entity_type> entities`

#### vars
`context` 是一个类似于依赖注入容器的东西，可以插入任意类型的对象，也可以尝试从中获取任意类型的对象实例，也支持在插入的时候进行命名来让它可以接受多个相同类型的对象，使用实例如下：
```cpp
// creates a new context variable by type and returns it
registry.ctx().emplace<my_type>(42, 'c');

// creates a new named context variable by type and returns it
registry.ctx().emplace_as<my_type>("my_variable"_hs, 42, 'c');

// inserts or assigns a context variable by (deduced) type and returns it
registry.ctx().insert_or_assign(my_type{42, 'c'});

// inserts or assigns a named context variable by (deduced) type and returns it
registry.ctx().insert_or_assign("my_variable"_hs, my_type{42, 'c'});

// gets the context variable by type as a non-const reference from a non-const registry
auto &var = registry.ctx().get<my_type>();

// gets the context variable by name as a const reference from either a const or a non-const registry
const auto &cvar = registry.ctx().get<const my_type>("my_variable"_hs);

// resets the context variable by type
registry.ctx().erase<my_type>();

// resets the context variable associated with the given name
registry.ctx().erase<my_type>("my_variable"_hs);
```

`context` 的核心是一个 `dense_map` 类型的 `ctx` 字段，其具体类型可以简单地看作是 `dense_map<uint32_t, void*>`，因此可以存储任意类型的数据。

> 上述说法只是为了方便理解并不准确，`basic_any` 还包含了类型信息、vtable、以及引用类型（所有者、读写、只读）。

> `dense_map` 相关内容可以查看 [EnTT中的Dense Map](../../blog/Hexo/看看源码捏/EnTT/EnTT中的Dense Map)

#### pools
`pools` 的类型可以简单看作 `dense_map<uint32_t, std::shared_ptr<sparse_set>>`。它里面存储了各种 Component 的实例，它的值 `std::shared_ptr<sparse_set>>` 其实指向的是各种 Component 对应的 Storage。

> Storage 相关内容可以查看 [EnTT中的Storage](../../blog/EnTT中的Storage)