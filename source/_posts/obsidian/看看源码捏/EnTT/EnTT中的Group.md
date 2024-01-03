---
publish: true
title: EnTT源码解读【11】：EnTT中的Group
date: 2023-12-30 15:40
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
# EnTT 中的 Group
## Group 是什么
**Group**是一种侵入性工具，用于处理 Entity 和 Component，可提高关键路径的性能，但它本身也会带来额外的性能损耗和使用限制。

另一个同样可以访问 Entity 和 Component 但非侵入性的工具：[View](../../blog/EnTT中的View)

虽然单从功能上来看 Group 和 View 很接近，但在其它 ECS 库中，与 Group 最接近的概念是 Archetype。

> Group 和 Archetype 只是责任类似，原理是完全不同的。  
> Group 更像是一个 Archetype 和 Query 的结合体，且它对 Entity 和 Component 的编排方式与 Archetype 完全不同，只是都有编排的能力。

## Group 的基本使用
与 View 十分类似：
```cpp
auto group = registry.group<position>(entt::get<velocity, renderable>);

for(auto entity: group) {
    // a component at a time ...
    auto &position = group.get<position>(entity);
    auto &velocity = group.get<velocity>(entity);

    // ... multiple components ...
    auto [pos, vel] = group.get<position, velocity>(entity);

    // ... all components at once
    auto [pos, vel, rend] = group.get(entity);

    // ...
}

// through a callback
registry.group<position>(entt::get<velocity>).each([](auto entity, auto &pos, auto &vel) {
    // ...
});

// using an input iterator
for(auto &&[entity, pos, vel]: registry.group<position>(entt::get<velocity>).each()) {
    // ...
}
```

与 View 的参数分为两部分不同，Group 的参数分为三部分：
- Owned：必须包含，且 Group 获取所有权的 Component 类型
- Get: 必须包含，且 Group 不获取所有权的 Component 类型
- Exclude: 必须不包含的 Component 类型

一个例子：
```cpp
auto group = registry.group<position>(entt::get<velocity>, entt::exclude<renderable>);
```
上述例子中，`group` 获取了 `position` 的所有权，并且保证通过它遍历出来的 Entity 必定拥有 `velocity`，以及必定不拥有 `renderable`。

## Group 的基本原理
### 数据存储
#### basic_group
部分定义：
```cpp
// src/entt/entity/group.hpp

/**
 * @brief Owning group.
 *
 * Owning groups returns all entities and only the entities that are at
 * least in the given storage. Moreover:
 *
 * * It's guaranteed that the entity list is tightly packed in memory for fast
 *   iterations.
 * * It's guaranteed that all components in the owned storage are tightly packed
 *   in memory for even faster iterations and to allow direct access.
 * * They stay true to the order of the owned storage and all instances have the
 *   same order in memory.
 *
 * The more types of storage are owned, the faster it is to iterate a group.
 *
 * @b Important
 *
 * Iterators aren't invalidated if:
 *
 * * New elements are added to the storage.
 * * The entity currently pointed is modified (for example, components are added
 *   or removed from it).
 * * The entity currently pointed is destroyed.
 *
 * In all other cases, modifying the pools iterated by the group in any way
 * invalidates all the iterators.
 *
 * @tparam Owned Types of storage _owned_ by the group.
 * @tparam Get Types of storage _observed_ by the group.
 * @tparam Exclude Types of storage used to filter the group.
 */
template<typename... Owned, typename... Get, typename... Exclude>
class basic_group<owned_t<Owned...>, get_t<Get...>, exclude_t<Exclude...>> {
    using base_type = std::common_type_t<typename Owned::base_type..., typename Get::base_type..., typename Exclude::base_type...>;
    using underlying_type = typename base_type::entity_type;

    template<typename Type>
    static constexpr std::size_t index_of = type_list_index_v<std::remove_const_t<Type>, type_list<typename Owned::value_type..., typename Get::value_type..., typename Exclude::value_type...>>;

	...
	
public:

	...
	
    /*! @brief Group handler type. */
    using handler = internal::group_handler<owned_t<std::remove_const_t<Owned>...>, get_t<std::remove_const_t<Get>...>, exclude_t<std::remove_const_t<Exclude>...>>;
    
	...
	
private:
    handler *descriptor;
};
```

显然，`basic_group` 只是对 `group_handler` 类型的一层封装。

`basic_group` 提供的主要功能包括：
- 对 Entity 和 Component 进行遍历
- 对 Entity 和 Component 进行排序
- 获取特定 Entity 的特定 Component

#### group_handler
部分定义：
```cpp
// src/entt/entity/group.hpp

struct group_descriptor {
    using size_type = std::size_t;
    virtual ~group_descriptor() = default;
    virtual size_type owned(const id_type *, const size_type) const noexcept {
        return 0u;
    }
};

template<typename, typename, typename>
class group_handler;

template<typename... Owned, typename... Get, typename... Exclude>
class group_handler<owned_t<Owned...>, get_t<Get...>, exclude_t<Exclude...>> final: public group_descriptor {
    // nasty workaround for an issue with the toolset v141 that doesn't accept a fold expression here
    static_assert(!std::disjunction_v<std::bool_constant<Owned::traits_type::in_place_delete>...>, "Groups do not support in-place delete");
    static_assert(!std::disjunction_v<std::is_const<Owned>..., std::is_const<Get>..., std::is_const<Exclude>...>, "Const storage type not allowed");

    using base_type = std::common_type_t<typename Owned::base_type..., typename Get::base_type..., typename Exclude::base_type...>;
    using entity_type = typename base_type::entity_type;

	...

private:
    std::tuple<Owned *..., Get *...> pools;
    std::tuple<Exclude *...> filter;
    std::size_t len;
```

在默认情况下，这里的 `Owned` 、 `Get` 和 `Exclude` 都是 `basic_storage` 类型。

可见，`group_handler` 被分为三部分：
- `pools`：存放了用于存储各个 `Owned` 和 `Get` 类型 Component 的 `basic_storage` 指针，`Owned` 部分代表 Component 所有权移交当前 Group 的部分，`Get` 代表遍历得到的 Entity 必须包含的 Component 的部分
- `filter`: 存放了用于存储各个 `Exclude` 类型 Component 的 `basic_storage` 指针
- `len`: 一个长度，用于记录符合当前 Group 的 Entity 的数量

`group_handler` 的数据存储部分和 `view` 非常相似：
- 都包含一个 `pools` 字段用于表示“有”的部分
- 都包含一个 `filter` 字段用于表示“没有”的部分

### 所有权
这是 Group 和 View 存在根本性差距的地方。

View 不会获取 Component 的所有权，不会对存储 Component 的 Storage 做出修改。它存储的数据仅仅用于获取和筛选 Entity 或 Component，本身非常轻量。

Group 会获取 `Owned` 模板参数指定的 Component 的所有权，会对存储 Component 的 Storage 做出修改以加速部分情况下的遍历。由于需要*编排 Entity 和 Component 的位置*和*监测 Entity 的 Component 组合的改变*，它会带来额外的性能开销。同时由于 Group 会获取 Component 的所有权，无法创建两个拥有同一 Component 类型的 Group，哪怕它们理论上遍历得到的 Entity 永远不可能相交。

> 例如：  
> 一个 Group 要求持有类型 A 的所有权且不包含类型 B，另一个 Group 要求持有类型 B 的所有权且包含类型 B。  
> 显然，符合这两个 Group 的 Component 组合永远不可能相交，但是并不能创建这两个 Group。

### 数据编排
与 View 的非侵入式不同，Group 会移动其中存储的 Component 的位置，这也是它需要获取 Component 的所有权的原因。

当 Group 创建时，或者涉及到所有权被某个 Group 所拥有的 Component 被添加/删除时，会尝试对数据进行编排，来让符合 Group 要求的 Entity 及其 Component 满足如下特性：
- Entity 和 Component 会位于各自存储容器的开头位置，且紧密排列
- 各个 Entity 及其 Component 在容器中的索引保持一致

假设存在三个 Component 类型："position"、"name"、"speed"，下面是一个可能的例子：  
![EnTT中的Group data storage.svg](EnTT中的Group data storage.svg)  
上图中的数字代表 Entity 的 ID，绿色代表 Component 的组合符合 Group 要求，红色代表不符合。两个蓝色虚线框分别框选出了两个 Entity，它们的 Component 在容器中的位置保证相同。

#### 初始化
见下面一段代码：
```cpp
// src/entt/entity/group.hpp

template<typename Alloc>
group_handler(const Alloc &alloc, Get &...gpool, Exclude &...epool)
	: pools{&gpool...},
	  filter{&epool...},
	  elem{alloc} {
	std::apply([this](auto *...cpool) { ((cpool->on_construct().template connect<&group_handler::push_on_construct>(*this), cpool->on_destroy().template connect<&group_handler::remove_if>(*this)), ...); }, pools);
	std::apply([this](auto *...cpool) { ((cpool->on_construct().template connect<&group_handler::remove_if>(*this), cpool->on_destroy().template connect<&group_handler::push_on_destroy>(*this)), ...); }, filter);

	for(const auto entity: static_cast<base_type &>(*std::get<0>(pools))) {
		push_on_construct(entity);
	}
}
```

这是 `group_handler` 的构造函数，可见其中主要包含了两部分逻辑：  
1. 为三类 Component 类型分别注册 `on_destroy` 和 `on_construct` 事件回调函数
2. 对当前已经存在的 Component 调用 `push_on_construct`

涉及到的三种回调函数定义如下：
```cpp
// src/entt/entity/group.hpp

void swap_elements(const std::size_t pos, const entity_type entt) {
	std::apply([pos, entt](auto *...cpool) { (cpool->swap_elements(cpool->data()[pos], entt), ...); }, pools);
}

void push_on_construct(const entity_type entt) {
	if(std::apply([entt, len = len](auto *cpool, auto *...other) { return cpool->contains(entt) && !(cpool->index(entt) < len) && (other->contains(entt) && ...); }, pools)
	   && std::apply([entt](auto *...cpool) { return (!cpool->contains(entt) && ...); }, filter)) {
		swap_elements(len++, entt);
	}
}

void push_on_destroy(const entity_type entt) {
	if(std::apply([entt, len = len](auto *cpool, auto *...other) { return cpool->contains(entt) && !(cpool->index(entt) < len) && (other->contains(entt) && ...); }, pools)
	   && std::apply([entt](auto *...cpool) { return (0u + ... + cpool->contains(entt)) == 1u; }, filter)) {
		swap_elements(len++, entt);
	}
}

void remove_if(const entity_type entt) {
	if(std::get<0>(pools)->contains(entt) && (std::get<0>(pools)->index(entt) < len)) {
		swap_elements(--len, entt);
	}
}
```

这里 `swap_elements` 的功能是将指定的 Entity 的所有 Component 与指定位置上的元素交换。

后面几个方法都是在满足某些条件的情况下去调用 `swap_elements`。

#### `push_on_construct`
用于 Component 组合中因为添加 Component 而符合 Group 要求的情况，以及初始化。

被注册给 `pools` 的 `on_construct`。

当 Entity 满足如下条件时调用 `swap_elements`：
- 具有 `pools` 中所有类型的 Component
- 不具有 `filter` 中所有类型的 Component
- 索引不小于 `len`

此时会将 Entity 的所有 Component 放在索引为 `len` 的位置，并且 `len++`。

> 这里的“索引”取的是 `pools` 中第一个 Component 类型的索引。

> 这里判断“索引”的意义是什么？  
> `len` 相当于符合 Group 要求的 Entity（或者说 Component 组合）数，且符合要求的 Component 都被集中在各自存储容器的开头紧密排列，因此可以通过判断“索引”是否小于 `len` 来判断当前 Entity 上的 Component 是否已经完成了位置编排，用于跳过不必要的重复运算。

假设存在三个 Component 类型："position"、"name"、"speed"，下面是一个可能的例子：  
![EnTT中的Group data storage push_on_construct.svg](EnTT中的Group data storage push_on_construct.svg)  
绿底代表已经完成位置移动的 Component，红底代表不符合要求的 Component，黄底代表这个例子中新加入的 Component，蓝色边框代表这个例子中在新加入一个 Component 后，多出来的一组满足要求的 Component。

#### `push_on_destroy`
用于 Component 组合中因为移除 Component 而符合 Group 要求的情况。

条件与 `push_on_construct` 类似，唯一的区别在于要求 Component 组合中包含且仅包含一项 `filter` 中的 Component 类型。

被注册给 `filter` 的 `on_destroy`。

> 为什么要包含一项 `filter` 中的 Component 类型？  
> 这个事件处理方法是注册给 `filter` 的 `on_destroy` 的，因此会在 Component 被移除之前调用，此时 Component 组合中还包含了这个将要被移除的 Component。

假设存在三个 Component 类型："position"、"name"、"speed"，下面是一个可能的例子：  
![EnTT中的Group data storage push_on_destroy.svg](EnTT中的Group data storage push_on_destroy.svg)  
绿底代表已经完成位置移动的 Component，红底代表不符合要求的 Component，黄底代表这个例子中移除的 Component，蓝色边框代表这个例子中在移除一个 Component 后，多出来的一组满足要求的 Component，左侧白箭头代表 Group 拥有所有权的 Component，红箭头代表 Component 组合中不能包含的 Component。

#### `remove_if`
用于 Component 组合中因为移除 Component 而符合 Group 要求的情况。

条件很简单，如果当前 Entity 还存在且索引小于 `len` 即可。

> 这里的当前 Entity 是否存在是通过能否在 `pools` 中的第一个 Component 容器里找到这个 Entity 的 Component 来判断的。

被注册给 `filter` 的 `on_construct` 和 `pools` 的 `on_destroy`。

> 为什么这里不需要区分 `on_construct` 和 `on_destroy` 的逻辑？  
> `on_destroy` 中为了判断在移除即将移除的 Component 后是否能使 Component 组合符合 Group 要求才做的区分处理，而 `remove_if` 不同，不论是移除一个 Group 要求包含的 Component，还是添加一个 Group 要求不包含的 Component 都必定使得结果不符合 Group 要求，因此不用做区分。

假设存在三个 Component 类型："position"、"name"、"speed"，下面是两个可能的例子：  
![EnTT中的Group data storage remove_if add.svg](EnTT中的Group data storage remove_if add.svg)  
![EnTT中的Group data storage remove_if remove.svg](EnTT中的Group data storage remove_if remove.svg)  
绿底代表已经完成位置移动的 Component，红底代表不符合要求的 Component，黄底代表这个例子中将要添加/移除的 Component，蓝色边框代表这个例子中在添加/移除一个 Component 时，原本满足要求的一组 Component，左侧白箭头代表 Group 拥有所有权的 Component，红箭头代表 Component 组合中不能包含的 Component。

## 限制
由于 Group 会接管 Component 的所有权，而且同一个 Registry 下同类型的 Component 都存储在同一个 Storage 中，也就意味着同一 Registry 下的同类型 Component 的所有权只能被一个 Group 所拥有，因此类似以下的代码会报错：
```cpp
registry.group<my_namespace::Position>();
registry.group<my_namespace::Position, my_namespace::Name>();
```
上述有两个 Group 都试图获取 `Position` 的所有权。

----
### ！！！以下内容疑似 bug，已提 issue！！！
Group 在进行数据编排的时候会移动没有所有权的 Component。

以下示例代码在 3.12.0 之前能够正常运行，3.12.0 开始会报错：
```cpp

namespace my_namespace
{
    struct Position
    {
        float x;
        float y;
    };

    struct Name
    {
        std::string name;
    };

    struct Health
    {
        int health;
    };

    void print_on_destroy(entt::registry& registry, entt::entity entity)
    {
        std::cout << "Component of Entity(" << entt::to_integral(entity) << ") destroyed" << std::endl;
    }
}

int main(int argc, char* argv[])
{
    auto registry = entt::registry{};
    auto name_group_with_pos = registry.group<my_namespace::Name>(entt::get<my_namespace::Position>);
    auto pos_group_with_health = registry.group<my_namespace::Position>(entt::get<my_namespace::Health>);

    auto entity_with_pos_health = registry.create();
    registry.emplace<my_namespace::Position>(entity_with_pos_health, 1.0f, 2.0f);
    registry.emplace<my_namespace::Health>(entity_with_pos_health, 100);

    auto entity_with_name_pos = registry.create();
    registry.emplace<my_namespace::Name>(entity_with_name_pos, "Entity with name and pos");
    registry.emplace<my_namespace::Position>(entity_with_name_pos, 3.0f, 4.0f);

    name_group_with_pos.each([](auto entity, auto& name, auto& position)
        {
            std::cout << "Entity(" << entt::to_integral(entity) << ") has name(" << name.name << ") and position(" << position.x << ", " << position.y << ")" << std::endl;
        });

    pos_group_with_health.each([](auto entity, auto& position, auto& health)
        {
            std::cout << "Entity(" << entt::to_integral(entity) << ") has position(" << position.x << ", " << position.y << ") and health(" << health.health << ")" << std::endl;
        });

    return 0;
}
```

上述代码为什么会发生问题？  
Group 在进行遍历的时候，会认为索引小于 `len` 的部分中索引相同的 Component 属于同一 Entity，不会有检查，以此来提高运行效率，但是由于数据编排会改动不属于自己的 Component，因此可能会导致其它 Group 中索引小于 `len` 的部分不再满足假定的情况，因此发生错误。

用图片来解释就是：  
![EnTT中的Group issue swap_elements.svg](EnTT中的Group issue swap_elements.svg)  
原本编号为 0 的 Entity 的两个 Component 索引相同，后面由于编号为 1 的 Entity 的两个 Component 的加入，位置发生了改变，编号为 0 的 Entity 的两个 Component 的索引就不同了。
